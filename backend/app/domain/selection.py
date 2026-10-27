"""Forecast selection. This is the only place a forecast vintage is chosen for a target."""

from typing import Literal

import pandas as pd

Interp = Literal["hold", "linear"]


class LeakageError(ValueError):
    """A selected forecast was published after the time the decision had to be made."""


def expand_to_half_hourly(forecasts: pd.DataFrame, method: Interp = "hold") -> pd.DataFrame:
    """WINDFOR is hourly. Turn each hourly row into two half-hour rows.

    hold: the value at T applies to T:00 and T:30.
    linear: T:30 is the mean of the T and T+1h values of the same vintage (hold if T+1h is missing).
    Returns startTime, publishTime, forecast.
    """
    base = forecasts[["startTime", "publishTime", "generation"]].rename(columns={"generation": "forecast"})
    second = base.copy()
    if method == "linear":
        nxt = base.assign(startTime=base["startTime"] - pd.Timedelta(hours=1)).rename(columns={"forecast": "next"})
        second = second.merge(nxt, on=["startTime", "publishTime"], how="left")
        second["forecast"] = (second["forecast"] + second["next"].fillna(second["forecast"])) / 2
        second = second.drop(columns="next")
    second["startTime"] = second["startTime"] + pd.Timedelta(minutes=30)
    out = pd.concat([base, second], ignore_index=True)
    return out.sort_values(["startTime", "publishTime"], kind="stable").reset_index(drop=True)


def enforce_publish_limit(selected: pd.DataFrame, limit: pd.Timestamp | pd.Series) -> None:
    """The leakage guard. Raises if any selected row has publishTime > limit."""
    if selected.empty:
        return
    bad = selected["publishTime"] > limit
    if bool(bad.any()):
        first = selected.loc[bad].iloc[0]
        raise LeakageError(
            f"forecast for {first['startTime']} was published at {first['publishTime']}, after the decision time"
        )


def _latest_per_target(rows: pd.DataFrame) -> pd.DataFrame:
    # Stable sort, so for an exact publishTime tie the later row in the source wins.
    ordered = rows.sort_values(["startTime", "publishTime"], kind="stable")
    last = ordered.groupby("startTime", sort=True).tail(1)
    out = last[["startTime", "publishTime", "forecast"]].reset_index(drop=True)
    out["horizon_h"] = (out["startTime"] - out["publishTime"]).dt.total_seconds() / 3600
    return out


def select_forecast_at_cutoff(forecasts: pd.DataFrame, targets: pd.DatetimeIndex, cutoff: pd.Timestamp) -> pd.DataFrame:
    """For each target, the row with the latest publishTime that is <= cutoff.

    Targets with no such row are absent from the result (the caller counts them).
    """
    rows = forecasts[forecasts["startTime"].isin(targets) & (forecasts["publishTime"] <= cutoff)]
    out = _latest_per_target(rows)
    enforce_publish_limit(out, cutoff)
    return out


def select_forecast_min_lead(forecasts: pd.DataFrame, targets: pd.DatetimeIndex, lead_hours: float) -> pd.DataFrame:
    """For each target T, the latest row with publishTime <= T - lead_hours."""
    rows = forecasts[forecasts["startTime"].isin(targets)]
    limit = rows["startTime"] - pd.Timedelta(hours=lead_hours)
    rows = rows[rows["publishTime"] <= limit]
    out = _latest_per_target(rows)
    enforce_publish_limit(out, out["startTime"] - pd.Timedelta(hours=lead_hours))
    return out


def select_latest_ever(forecasts: pd.DataFrame, targets: pd.DatetimeIndex) -> pd.DataFrame:
    """The hindsight series: latest publishTime of any kind, including after delivery. Not usable live."""
    return _latest_per_target(forecasts[forecasts["startTime"].isin(targets)])
