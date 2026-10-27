"""Ties the pure domain functions to the loaded snapshot. Results are cached per parameter set."""

from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from typing import Literal

import numpy as np
import pandas as pd

from . import config
from .data.loader import Snapshot
from .domain import bands, metrics, quality, receipt, selection
from .domain.timeutil import LONDON, cutoff_utc, half_hour_targets, london_day_bounds_utc

Scope = Literal["decision_in_january", "delivery_in_january"]


@dataclass(frozen=True)
class Spec:
    mode: Literal["cutoff", "lead"] = "cutoff"
    cutoff: str = config.DEFAULT_CUTOFF
    lead_hours: float = 0.0
    interp: Literal["hold", "linear"] = "hold"

    def label(self) -> str:
        return f"cutoff {self.cutoff} London" if self.mode == "cutoff" else f"at least {self.lead_hours:g} h ahead"


class Engine:
    def __init__(self, snap: Snapshot):
        self.snap = snap
        self.actuals = snap.actuals.drop_duplicates("startTime", keep="last").set_index("startTime")["generation"]
        self.flagged = quality.flagged_actual_periods(snap.actuals)
        local_idx = pd.DatetimeIndex(snap.actuals["startTime"]).tz_convert(LONDON)
        counts = pd.Series(local_idx.date).value_counts()
        self.all_days: list[date] = sorted(d for d, n in counts.items() if n == len(half_hour_targets(d)))

    # ---- scopes and times -------------------------------------------------
    def scope_days(self, scope: Scope) -> list[date]:
        if scope == "delivery_in_january":
            return [d for d in self.all_days if d.month == 1]
        return [d for d in self.all_days if d > self.all_days[0]]

    def decision_ts(self, delivery_day: date, spec: Spec) -> pd.Timestamp:
        if spec.mode == "cutoff":
            return cutoff_utc(delivery_day - timedelta(days=1), spec.cutoff)
        return london_day_bounds_utc(delivery_day)[0] - pd.Timedelta(hours=spec.lead_hours)

    @lru_cache(maxsize=4)  # noqa: B019
    def forecasts_hh(self, interp: str) -> pd.DataFrame:
        return selection.expand_to_half_hourly(self.snap.forecasts, interp)  # type: ignore[arg-type]

    # ---- selection --------------------------------------------------------
    def select_day(self, delivery_day: date, spec: Spec) -> pd.DataFrame:
        """Selected forecast per half-hour of the delivery day, with actual where known."""
        targets = half_hour_targets(delivery_day)
        fc = self.forecasts_hh(spec.interp)
        if spec.mode == "cutoff":
            sel = selection.select_forecast_at_cutoff(fc, targets, self.decision_ts(delivery_day, spec))
        else:
            sel = selection.select_forecast_min_lead(fc, targets, spec.lead_hours)
        sel["actual"] = sel["startTime"].map(self.actuals)
        sel["delivery_day"] = delivery_day
        return sel

    @lru_cache(maxsize=64)  # noqa: B019
    def error_table(self, spec: Spec) -> pd.DataFrame:
        """All delivery days, rows that have both a forecast and an actual."""
        frames = [self.select_day(d, spec) for d in self.all_days]
        tab = pd.concat(frames, ignore_index=True)
        tab = tab.dropna(subset=["actual"]).reset_index(drop=True)
        tab = metrics.add_error(tab)
        tab["flagged"] = tab["startTime"].isin(self.flagged)
        return tab

    @lru_cache(maxsize=64)  # noqa: B019
    def coverage_table(self, spec: Spec) -> pd.DataFrame:
        rows = []
        for d in self.all_days:
            n_targets = len(half_hour_targets(d))
            sel = self.select_day(d, spec)
            rows.append(
                {
                    "delivery_day": d,
                    "targets": n_targets,
                    "with_forecast": len(sel),
                    "with_actual": int(sel["actual"].notna().sum()),
                }
            )
        return pd.DataFrame(rows)

    @lru_cache(maxsize=64)  # noqa: B019
    def models(self, spec: Spec, lag_hours: float, min_days: int) -> dict[date, bands.BandModel | None]:
        return bands.walk_forward_models(
            self.error_table(spec), lambda d: self.decision_ts(d, spec), lag_hours, min_days
        )

    def scoped(self, spec: Spec, scope: Scope) -> pd.DataFrame:
        tab = self.error_table(spec)
        return tab[tab["delivery_day"].isin(self.scope_days(scope))]

    # ---- all vintages vs actuals -----------------------------------------
    @lru_cache(maxsize=8)  # noqa: B019
    def all_vintages_joined(self, interp: str, scope: Scope) -> pd.DataFrame:
        fc = self.forecasts_hh(interp)
        start = london_day_bounds_utc(self.scope_days(scope)[0])[0]
        end = london_day_bounds_utc(self.scope_days(scope)[-1])[1]
        fc = fc[(fc["startTime"] >= start) & (fc["startTime"] < end)].copy()
        fc["actual"] = fc["startTime"].map(self.actuals)
        fc = fc.dropna(subset=["actual"])
        fc["horizon_h"] = (fc["startTime"] - fc["publishTime"]).dt.total_seconds() / 3600
        return fc

    # ---- receipt ----------------------------------------------------------
    def receipt_header(self, delivery_day: date, spec: Spec) -> dict:
        m = self.snap.manifest
        return {
            "receipt_version": 1,
            "delivery_day": delivery_day.isoformat(),
            "decision_day": (delivery_day - timedelta(days=1)).isoformat(),
            "selection_mode": spec.mode,
            "cutoff_london": spec.cutoff if spec.mode == "cutoff" else None,
            "min_lead_hours": spec.lead_hours if spec.mode == "lead" else None,
            "decision_timestamp_utc": self.decision_ts(delivery_day, spec).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "hourly_to_half_hourly": spec.interp,
            "sign_convention": "error = forecast - actual; positive is over-forecast",
            "assumptions": [
                "WINDFOR is hourly; the value at startTime T applies to the hour starting at T.",
                "Selected forecast is the row with the latest publishTime <= the decision timestamp.",
                "Actuals are FUELHH WIND (metered, after curtailment) and are shown for review only.",
            ],
            "snapshot_id": m.get("snapshot_id"),
            "snapshot_fetched_at_utc": m.get("fetched_at_utc"),
            "sources": {name: f["source_urls"] for name, f in m.get("files", {}).items()},
            "git_commit": config.git_commit(),
        }

    def build_receipt(self, delivery_day: date, spec: Spec) -> dict:
        sel = self.select_day(delivery_day, spec).dropna(subset=["actual"])
        return receipt.build_receipt(sel, self.receipt_header(delivery_day, spec))

    # ---- helpers for views -------------------------------------------------
    def windows(self, values: np.ndarray, starts: pd.Series, n: int = 6, lowest: bool = True) -> dict | None:
        if len(values) < n:
            return None
        roll = pd.Series(values).rolling(n).mean().dropna()
        i = int(roll.idxmin() if lowest else roll.idxmax())
        first = i - n + 1
        return {
            "start": starts.iloc[first],
            "end": starts.iloc[i] + pd.Timedelta(minutes=30),
            "mean_mw": float(roll.loc[i]),
        }
