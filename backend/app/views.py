"""Builds each API response from the engine. No I/O besides the engine's cached frames."""

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd

from . import config
from . import models as m
from .domain import bands, metrics, quality, selection
from .domain.timeutil import LONDON, half_hour_targets, london_day_bounds_utc
from .engine import Engine, Scope, Spec

SIGN = "error = forecast - actual (MW). Positive means over-forecast, which leaves the buyer short."
GATE_SOURCES = [
    {
        "name": "EPEX SPOT GB day-ahead auction",
        "note": "moved from 11:00 GMT to 09:20 GMT from 1 January 2021 (10:20 CET)",
        "url": "https://epexspot.com/en/news/exchange-council-welcomes-new-timing-gb-day-ahead-auction",
    },
    {
        "name": "Nord Pool N2EX day-ahead auction",
        "note": "gate closure 09:50 GMT, which Nord Pool also gives as 10:50 CET",
        "url": "https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-day-ahead-gb-auction",
    },
]
CAVEATS = [
    "FUELHH is metered output after curtailment. Wind farms paid to turn down appear as forecast error even when the forecast was right.",
    "FUELHH and WINDFOR may cover different sets of wind farms, so part of the gap is population, not forecast skill. The allowed data cannot separate this.",
    "Errors are not normalised by installed capacity, because capacity is not in the allowed data.",
    "Only January 2026 is covered. Winter wind, so the results say little about summer.",
    "No prices, demand or weather data are used.",
]
ASSUMPTIONS = [
    "Decision day D is 1 to 31 Jan 2026 and delivery day is D+1, so delivery days are 2 Jan to 1 Feb. A variant with delivery days 1 to 31 Jan is available.",
    "Times are stored in UTC and cutoffs are London wall-clock times. January has no daylight saving.",
    "Selected forecast = row with the latest publishTime that is at or before the cutoff. Ties on publishTime take the later source row.",
    "WINDFOR is hourly. The value at T is applied to both half-hours it covers. Linear interpolation is an option.",
    "The value at startTime T is read as the hour starting at T. The Elexon docs were not conclusive on this.",
    "Error bands use delivery days whose actuals were complete (last period plus publication lag) before the decision timestamp.",
    "Level buckets are terciles of forecast computed from that history only. A bucket with fewer than 20 samples falls back to all history.",
]


def _f(x: object) -> float | None:
    if x is None:
        return None
    v = float(x)  # type: ignore[arg-type]
    return None if math.isnan(v) else v


def _dt(ts: object):  # type: ignore[no-untyped-def]
    return pd.Timestamp(ts).to_pydatetime()


def _metrics(df: pd.DataFrame) -> m.Metrics:
    s = metrics.summarize(df)
    return m.Metrics(n=int(s["n"] or 0), **{k: _f(v) for k, v in s.items() if k != "n"})


def _labeled(rows: list[dict], label_fn) -> list[m.LabeledMetrics]:  # type: ignore[no-untyped-def]
    out = []
    for r in rows:
        r = dict(r)
        label = label_fn(r)
        r = {k: v for k, v in r.items() if k not in ("hour", "bucket")}
        out.append(m.LabeledMetrics(label=label, n=int(r.pop("n")), **{k: _f(v) for k, v in r.items()}))
    return out


def meta(engine: Engine, admin_enabled: bool) -> m.MetaResponse:
    mf = engine.snap.manifest
    return m.MetaResponse(
        snapshot=m.SnapshotInfo(
            snapshot_id=mf.get("snapshot_id"),
            fetched_at_utc=mf.get("fetched_at_utc"),
            api_base=mf.get("api_base"),
            rows={k: v["rows"] for k, v in mf.get("files", {}).items()},
            sources={k: v["source_urls"] for k, v in mf.get("files", {}).items()},
        ),
        git_commit=config.git_commit(),
        delivery_days={
            "decision_in_january": engine.scope_days("decision_in_january"),
            "delivery_in_january": engine.scope_days("delivery_in_january"),
        },
        default_scope="decision_in_january",
        default_cutoffs=config.DEFAULT_CUTOFFS,
        default_cutoff=config.DEFAULT_CUTOFF,
        default_lag_hours=config.DEFAULT_LAG_HOURS,
        default_min_history_days=config.DEFAULT_MIN_HISTORY_DAYS,
        sign_convention=SIGN,
        gate_closure_sources=GATE_SOURCES,
        admin_refresh_enabled=admin_enabled,
    )


def decision(
    engine: Engine,
    day: date,
    spec: Spec,
    ratio: float,
    lag_hours: float,
    min_days: int,
    include_actual: bool,
    hindsight: bool,
    flat_demand_mw: float | None,
) -> m.DecisionResponse:
    sel = engine.select_day(day, spec)
    if sel.empty:
        raise LookupError("no forecast was published before the decision time for this delivery day")
    ts = engine.decision_ts(day, spec)
    model = engine.models(spec, lag_hours, min_days).get(day)
    history_days = bands.eligible_history(engine.error_table(spec), ts, lag_hours)["delivery_day"].nunique()

    fc = sel["forecast"].reset_index(drop=True)
    if model is not None:
        band = bands.band_for(model, fc)
        cover = bands.cover_for_ratio(model, fc, ratio)
        status = f"band from {model.n_days} earlier delivery days"
    else:
        band, cover = None, None
        status = f"insufficient history: {history_days} of {min_days} delivery days available"

    latest = None
    if hindsight:
        li = selection.select_latest_ever(engine.forecasts_hh(spec.interp), half_hour_targets(day))
        latest = sel["startTime"].map(li.set_index("startTime")["forecast"])

    pts = []
    for i, r in enumerate(sel.itertuples()):
        pts.append(
            m.DecisionPoint(
                t=_dt(r.startTime),
                forecast_mw=float(r.forecast),
                publish_time=_dt(r.publishTime),
                horizon_h=float(r.horizon_h),
                band_low_mw=_f(band["band_low"].iloc[i]) if band is not None else None,
                band_high_mw=_f(band["band_high"].iloc[i]) if band is not None else None,
                cover_mw=_f(cover[i]) if cover is not None else None,
                actual_mw=_f(r.actual) if include_actual else None,
                hindsight_forecast_mw=_f(latest.iloc[i]) if latest is not None else None,
            )
        )

    def win(w: dict | None) -> m.Window | None:
        return None if w is None else m.Window(start=_dt(w["start"]), end=_dt(w["end"]), mean_mw=w["mean_mw"])

    starts = sel["startTime"]
    summary = m.DecisionSummary(
        mean_gw=float(fc.mean() / 1000),
        min_gw=float(fc.min() / 1000),
        max_gw=float(fc.max() / 1000),
        low_wind_window=win(engine.windows(fc.to_numpy(), starts, 6, True)),
        highest_cover_window=win(engine.windows(cover, starts, 6, False)) if cover is not None else None,
        total_cover_mwh=float(cover.sum() * 0.5) if cover is not None else None,
    )

    raw = engine.snap.forecasts["publishTime"].drop_duplicates()
    dstart, dend = london_day_bounds_utc(day)
    near = raw[(raw >= ts - pd.Timedelta(hours=18)) & (raw <= dend)].sort_values()
    after = raw[raw > ts].sort_values()
    timeline = m.Timeline(
        vintages=[_dt(t) for t in near],
        decision_timestamp=_dt(ts),
        delivery_start=_dt(dstart),
        delivery_end=_dt(dend),
        next_vintage_after_decision=_dt(after.iloc[0]) if len(after) else None,
    )
    vint = sel.groupby("publishTime").size()
    remaining = None
    if flat_demand_mw is not None:
        use = cover if cover is not None else np.zeros(len(fc))
        remaining = float(np.maximum(0.0, flat_demand_mw - fc.to_numpy() + use).mean())
    day_metrics = _metrics(metrics.add_error(sel.dropna(subset=["actual"]))) if include_actual else None
    return m.DecisionResponse(
        delivery_day=day,
        selection=spec.label(),
        interp=spec.interp,
        ratio=ratio,
        target_quantile=ratio / (1 + ratio),
        decision_timestamp=_dt(ts),
        vintages=[m.Vintage(publish_time=_dt(k), targets=int(v)) for k, v in vint.items()],
        timeline=timeline,
        band_status=status,
        history_days=int(history_days),
        min_history_days=min_days,
        points=pts,
        summary=summary,
        day_metrics=day_metrics,
        flat_demand_mw=flat_demand_mw,
        remaining_need_mw=remaining,
    )


def accuracy(engine: Engine, spec: Spec, scope: Scope) -> m.AccuracyResponse:
    tab = engine.scoped(spec, scope)
    edges = metrics.tercile_edges(tab["forecast"])
    joined = engine.all_vintages_joined(spec.interp, scope)
    series = [
        m.SeriesPoint(t=_dt(r.startTime), forecast_mw=float(r.forecast), actual_mw=float(r.actual))
        for r in tab.itertuples()
    ]
    return m.AccuracyResponse(
        scope=scope,
        selection=spec.label(),
        delivery_days=int(tab["delivery_day"].nunique()),
        sign_convention=SIGN,
        headline=_metrics(tab),
        headline_excluding_flagged=_metrics(tab[~tab["flagged"]]),
        flagged_periods=int(tab["flagged"].sum()),
        by_hour=_labeled(metrics.by_hour(tab), lambda r: f"{int(r['hour']):02d}:00"),
        by_level=_labeled(metrics.by_level(tab, edges), lambda r: r["bucket"]),
        level_edges_mw=edges,
        by_horizon=_labeled(metrics.by_horizon(tab), lambda r: r["bucket"]),
        error_vs_lead=[
            m.LeadMetrics(
                from_h=r["from_h"],
                to_h=r["to_h"],
                n=int(r["n"]),
                **{k: _f(v) for k, v in r.items() if k not in ("from_h", "to_h", "n")},
            )
            for r in metrics.error_vs_lead(joined)
        ],
        histogram=[m.HistBin(**b) for b in metrics.histogram(tab["error"])],
        worst_days=[m.WorstDay(**w) for w in metrics.worst_days(tab)],
        series=series,
        capacity_note="Errors are in MW and are not normalised by installed capacity, which is not in the allowed data.",
    )


def sensitivity(
    engine: Engine, cutoffs: list[str], scope: Scope, interp: str, hindsight_cutoff: str
) -> m.SensitivityResponse:
    days = engine.scope_days(scope)
    results, picks = [], {}
    for c in cutoffs:
        spec = Spec(cutoff=c, interp=interp)  # type: ignore[arg-type]
        tab = engine.scoped(spec, scope)
        picks[c] = tab.set_index("startTime")["publishTime"]
        london = tab["publishTime"].dt.tz_convert(LONDON).dt.strftime("%H:%M")
        share = (london.value_counts() / len(tab)).to_dict()
        cov = engine.coverage_table(spec)
        cov = cov[cov["delivery_day"].isin(days)]
        results.append(
            m.CutoffResult(
                cutoff=c,
                metrics=_metrics(tab),
                vintage_share={k: float(v) for k, v in share.items()},
                targets_without_forecast=int((cov["targets"] - cov["with_forecast"]).sum()),
            )
        )
    pairs = []
    for i, a in enumerate(cutoffs):
        for b in cutoffs[i + 1 :]:
            both = pd.concat([picks[a], picks[b]], axis=1, keys=["a", "b"]).dropna()
            pairs.append(m.PairDiff(a=a, b=b, share_differs=float((both["a"] != both["b"]).mean())))
    lead = []
    for h in (0, 6, 12, 18, 24, 30, 36, 42, 48):
        tab = engine.scoped(Spec(mode="lead", lead_hours=float(h), interp=interp), scope)  # type: ignore[arg-type]
        lead.append(m.LeadResult(lead_hours=float(h), metrics=_metrics(tab)))

    base = Spec(cutoff=hindsight_cutoff, interp=interp)  # type: ignore[arg-type]
    dec = engine.scoped(base, scope)
    targets = pd.DatetimeIndex(dec["startTime"])
    li = selection.select_latest_ever(engine.forecasts_hh(interp), targets)
    li["actual"] = li["startTime"].map(engine.actuals)
    li = metrics.add_error(li.dropna(subset=["actual"]))
    after = float((li["publishTime"] > li["startTime"]).mean())
    dm, lm = _metrics(dec), _metrics(li)
    hind = m.HindsightComparison(
        cutoff=hindsight_cutoff,
        decision_time=dm,
        latest_ever=lm,
        share_after_delivery_start=after,
        mae_gap_mw=(dm.mae - lm.mae) if dm.mae is not None and lm.mae is not None else None,
    )
    groups: dict[tuple, list[str]] = {}
    for c in cutoffs:
        groups.setdefault(tuple(picks[c].astype(str)), []).append(c)
    maes = {r.cutoff: r.metrics.mae for r in results if r.metrics.mae is not None}
    spread = (max(maes.values()) - min(maes.values())) if maes else 0.0
    finding = (
        f"{len(cutoffs)} cutoffs produce {len(groups)} distinct selections. Cutoffs that pick identical vintages: "
        + "; ".join(" + ".join(g) for g in groups.values())
        + f". MAE moves by {spread:,.0f} MW between the best and worst cutoff."
    )
    return m.SensitivityResponse(
        scope=scope, cutoffs=results, pairwise=pairs, lead_curve=lead, hindsight=hind, finding=finding
    )


def data_quality(engine: Engine, spec: Spec, scope: Scope) -> m.QualityResponse:
    days = engine.scope_days(scope)
    aq = quality.actual_quality(engine.snap.actuals, days)
    fq = quality.forecast_quality(engine.snap.forecasts)
    cov = engine.coverage_table(spec)
    cov = cov[cov["delivery_day"].isin(days)]
    tab = engine.scoped(spec, scope)
    no_fc = float(1 - cov["with_forecast"].sum() / cov["targets"].sum())
    return m.QualityResponse(
        scope=scope,
        actuals_rows=aq["rows"],
        missing_periods=aq["missing_periods"],
        duplicate_periods=aq["duplicate_periods"],
        nonpositive_actuals=aq["nonpositive"],
        late_published_actuals=aq["late_published"],
        per_day=[m.DayQuality(**d) for d in aq["per_day"]],
        forecast_rows=fq["rows"],
        forecast_vintages=fq["vintages"],
        forecast_resolution_minutes=fq["resolution_minutes"],
        usual_publish_times_utc=fq["usual_publish_times_utc"],
        irregular_publish_times=fq["irregular_publish_times"],
        forecast_duplicate_rows=fq["duplicate_rows"],
        forecast_nonpositive=fq["nonpositive"],
        targets_without_forecast_share=no_fc,
        headline=_metrics(tab),
        headline_excluding_flagged=_metrics(tab[~tab["flagged"]]),
        caveats=CAVEATS,
        assumptions=ASSUMPTIONS,
    )


def calibration(
    engine: Engine, spec: Spec, scope: Scope, lag_hours: float, min_days: int, ratio: float
) -> m.CalibrationResponse:
    days = engine.scope_days(scope)
    errtab = engine.error_table(spec)
    models = engine.models(spec, lag_hours, min_days)
    cal = bands.calibration(errtab, models, days)
    curve = [bands.cover_backtest(errtab, models, days, r) for r in (0.5, 1.0, 2.0, 3.0, 5.0, 10.0)]
    chosen = bands.cover_backtest(errtab, models, days, ratio)
    worst = min(cal["by_bucket"], key=lambda b: b["coverage"]) if cal["by_bucket"] else None
    cov = cal["coverage"]
    finding = "No days had enough history for a band."
    if cov is not None and worst is not None:
        finding = (
            f"Out of sample the nominal 80% band held {cov:.1%} of {cal['n']:,} half-hours over {cal['days_scored']} days. "
            f"It missed most in the {worst['bucket']} bucket ({worst['coverage']:.1%} inside). "
            f"{cal['below']:.1%} of actuals fell below the band and {cal['above']:.1%} above."
        )
    return m.CalibrationResponse(
        scope=scope,
        selection=spec.label(),
        lag_hours=lag_hours,
        min_history_days=min_days,
        calibration=m.Calibration(**cal),
        cover_curve=[m.CoverBacktest(**c) for c in curve],
        chosen=m.CoverBacktest(**chosen),
        finding=finding,
    )


def day_range(engine: Engine) -> str:
    return f"{engine.all_days[0]} to {engine.all_days[-1]}"


def tomorrow(day: date) -> date:
    return day + timedelta(days=1)


def month(engine: Engine, spec: Spec, scope: Scope) -> m.MonthResponse:
    """Forecast only, one row per delivery day. Actuals are never read here, so nothing leaks into the picker."""
    days = []
    for d in engine.scope_days(scope):
        sel = engine.select_day(d, spec)
        if sel.empty:
            days.append(m.MonthDay(delivery_day=d, mean_gw=None, min_gw=None, max_gw=None, forecast_issued=None))
            continue
        fc = sel["forecast"]
        days.append(
            m.MonthDay(
                delivery_day=d,
                mean_gw=float(fc.mean() / 1000),
                min_gw=float(fc.min() / 1000),
                max_gw=float(fc.max() / 1000),
                forecast_issued=sel["publishTime"].max().to_pydatetime(),
            )
        )
    return m.MonthResponse(scope=scope, selection=spec.label(), days=days)
