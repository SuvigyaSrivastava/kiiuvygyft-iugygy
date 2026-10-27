"""Time helpers. Everything is stored in UTC; cutoffs are London wall-clock times."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

LONDON = ZoneInfo("Europe/London")
HALF_HOUR = pd.Timedelta(minutes=30)


def parse_hhmm(value: str) -> time:
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"cutoff must look like HH:MM, got {value!r}") from exc


def cutoff_utc(decision_day: date, hhmm: str) -> pd.Timestamp:
    """The clock cutoff on `decision_day` (London local time) as a UTC timestamp."""
    local = datetime.combine(decision_day, parse_hhmm(hhmm), tzinfo=LONDON)
    return pd.Timestamp(local).tz_convert("UTC")


def london_day_bounds_utc(day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    start = pd.Timestamp(datetime.combine(day, time(0, 0), tzinfo=LONDON)).tz_convert("UTC")
    end = pd.Timestamp(datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=LONDON)).tz_convert("UTC")
    return start, end


def half_hour_targets(day: date) -> pd.DatetimeIndex:
    """Half-hour start times (UTC) of one London delivery day. 46 or 50 on DST days."""
    start, end = london_day_bounds_utc(day)
    return pd.date_range(start, end, freq="30min", inclusive="left")


def london_hour(index: pd.DatetimeIndex | pd.Series) -> pd.Index:
    idx = pd.DatetimeIndex(index)
    return pd.Index(idx.tz_convert(LONDON).hour)
