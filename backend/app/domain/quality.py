"""Data quality checks on the raw snapshot rows."""

from datetime import date

import pandas as pd

from .timeutil import half_hour_targets

LATE_ACTUAL_HOURS = 1.0


def actual_quality(actuals: pd.DataFrame, days: list[date]) -> dict:
    per_day = []
    missing_total = 0
    for d in days:
        expected = half_hour_targets(d)
        present = actuals[actuals["startTime"].isin(expected)]
        missing = expected.difference(pd.DatetimeIndex(present["startTime"]))
        missing_total += len(missing)
        per_day.append({"day": d, "periods": int(present["startTime"].nunique()), "expected": len(expected)})
    in_scope = actuals[actuals["startTime"].isin(_all_targets(days))]
    lag_h = (in_scope["publishTime"] - in_scope["startTime"]).dt.total_seconds() / 3600
    return {
        "rows": len(in_scope),
        "missing_periods": missing_total,
        "duplicate_periods": int(in_scope["startTime"].duplicated().sum()),
        "nonpositive": int((in_scope["generation"] <= 0).sum()),
        "late_published": int((lag_h > LATE_ACTUAL_HOURS).sum()),
        "per_day": per_day,
    }


def flagged_actual_periods(actuals: pd.DataFrame) -> pd.DatetimeIndex:
    """Periods whose actual looks unreliable: nonpositive, duplicated, or published late."""
    lag_h = (actuals["publishTime"] - actuals["startTime"]).dt.total_seconds() / 3600
    bad = (actuals["generation"] <= 0) | actuals["startTime"].duplicated(keep=False) | (lag_h > LATE_ACTUAL_HOURS)
    return pd.DatetimeIndex(actuals.loc[bad, "startTime"])


def forecast_quality(forecasts: pd.DataFrame) -> dict:
    per_vintage = forecasts.groupby("publishTime")["startTime"].apply(lambda s: s.sort_values().diff().dropna().min())
    step = per_vintage.min() if len(per_vintage) else None
    publish = pd.Series(forecasts["publishTime"].drop_duplicates().sort_values().to_numpy())
    clock = pd.DatetimeIndex(publish).strftime("%H:%M")
    counts = pd.Series(clock).value_counts()
    usual = sorted(counts[counts >= max(5, counts.max() * 0.5)].index.tolist())
    irregular = [str(t) for t, c in zip(publish, clock, strict=True) if c not in usual]
    return {
        "rows": len(forecasts),
        "vintages": int(forecasts["publishTime"].nunique()),
        "resolution_minutes": int(step.total_seconds() // 60) if step is not None else None,
        "usual_publish_times_utc": usual,
        "irregular_publish_times": irregular,
        "duplicate_rows": int(forecasts.duplicated(["startTime", "publishTime"]).sum()),
        "nonpositive": int((forecasts["generation"] <= 0).sum()),
    }


def _all_targets(days: list[date]) -> pd.DatetimeIndex:
    out = pd.DatetimeIndex([])
    for d in days:
        out = out.append(half_hour_targets(d))
    return out
