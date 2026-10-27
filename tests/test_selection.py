import numpy as np
import pandas as pd
import pytest

from backend.app.domain.selection import (
    LeakageError,
    enforce_publish_limit,
    expand_to_half_hourly,
    select_forecast_at_cutoff,
    select_forecast_min_lead,
    select_latest_ever,
)
from tests.conftest import forecast_rows, ts, vintage_rows

T = pd.DatetimeIndex([ts("2026-01-02 12:00")])


def test_latest_before_cutoff_wins():
    fc = vintage_rows(
        [
            ("2026-01-02 12:00", "2026-01-01 04:30", 100),
            ("2026-01-02 12:00", "2026-01-01 07:30", 200),
            ("2026-01-02 12:00", "2026-01-01 09:30", 300),
        ]
    )
    sel = select_forecast_at_cutoff(fc, T, ts("2026-01-01 09:20"))
    assert sel["forecast"].tolist() == [200]
    assert sel["publishTime"].iloc[0] == ts("2026-01-01 07:30")


def test_forecast_published_exactly_at_cutoff_is_allowed():
    fc = vintage_rows([("2026-01-02 12:00", "2026-01-01 09:30", 300), ("2026-01-02 12:00", "2026-01-01 07:30", 200)])
    sel = select_forecast_at_cutoff(fc, T, ts("2026-01-01 09:30"))
    assert sel["forecast"].tolist() == [300]


def test_nothing_before_cutoff_means_no_forecast_for_target():
    fc = vintage_rows([("2026-01-02 12:00", "2026-01-01 09:30", 300)])
    assert select_forecast_at_cutoff(fc, T, ts("2026-01-01 09:00")).empty


def test_tie_on_publish_time_takes_later_source_row():
    fc = vintage_rows([("2026-01-02 12:00", "2026-01-01 07:30", 111), ("2026-01-02 12:00", "2026-01-01 07:30", 222)])
    assert select_forecast_at_cutoff(fc, T, ts("2026-01-01 09:20"))["forecast"].tolist() == [222]


def test_horizon_is_start_minus_publish_in_hours():
    fc = vintage_rows([("2026-01-02 12:00", "2026-01-01 07:30", 1)])
    assert select_forecast_at_cutoff(fc, T, ts("2026-01-01 09:20"))["horizon_h"].iloc[0] == 28.5


def test_guard_raises_on_late_publish():
    late = pd.DataFrame({"startTime": [ts("2026-01-02 12:00")], "publishTime": [ts("2026-01-01 09:31")]})
    with pytest.raises(LeakageError):
        enforce_publish_limit(late, ts("2026-01-01 09:30"))


def test_min_lead_uses_per_target_limit():
    fc = vintage_rows(
        [
            ("2026-01-02 12:00", "2026-01-02 00:00", 10),
            ("2026-01-02 12:00", "2026-01-02 06:00", 20),
            ("2026-01-02 12:00", "2026-01-02 11:00", 30),
        ]
    )
    assert select_forecast_min_lead(fc, T, 6)["forecast"].tolist() == [20]  # limit is 06:00 inclusive
    assert select_forecast_min_lead(fc, T, 0)["forecast"].tolist() == [30]
    assert select_forecast_min_lead(fc, T, 24).empty


def test_latest_ever_includes_publishes_after_delivery():
    fc = vintage_rows([("2026-01-02 12:00", "2026-01-01 07:30", 10), ("2026-01-02 12:00", "2026-01-03 02:30", 99)])
    assert select_latest_ever(fc, T)["forecast"].tolist() == [99]


def test_hold_expansion_applies_hourly_value_to_both_half_hours():
    fc = forecast_rows([("2026-01-02 12:00", "2026-01-01 07:30", 100), ("2026-01-02 13:00", "2026-01-01 07:30", 200)])
    out = expand_to_half_hourly(fc, "hold")
    assert out["startTime"].tolist() == [
        ts("2026-01-02 12:00"),
        ts("2026-01-02 12:30"),
        ts("2026-01-02 13:00"),
        ts("2026-01-02 13:30"),
    ]
    assert out["forecast"].tolist() == [100, 100, 200, 200]


def test_linear_expansion_averages_with_next_hour_of_same_vintage():
    fc = forecast_rows(
        [
            ("2026-01-02 12:00", "2026-01-01 07:30", 100),
            ("2026-01-02 13:00", "2026-01-01 07:30", 200),
            ("2026-01-02 12:00", "2026-01-01 09:30", 50),  # next hour missing in this vintage
        ]
    )
    out = expand_to_half_hourly(fc, "linear")
    half = out[out["startTime"] == ts("2026-01-02 12:30")].sort_values("publishTime")
    assert half["forecast"].tolist() == [150, 50]


@pytest.mark.parametrize("seed", range(20))
def test_property_selection_never_leaks_and_later_cutoff_never_older(seed):
    rng = np.random.default_rng(seed)
    vintages = pd.date_range("2026-01-01 00:00", periods=14, freq="150min", tz="UTC").as_unit("ns")
    rows = []
    for v in vintages:
        for h in rng.choice(np.arange(0, 48), size=12, replace=False):
            rows.append(
                (
                    str(ts("2026-01-02 00:00") + pd.Timedelta(hours=int(h)))[:16],
                    str(v)[:16],
                    float(rng.integers(1, 1000)),
                )
            )
    fc = vintage_rows(rows)
    targets = pd.DatetimeIndex(sorted({ts(r[0]) for r in rows}))
    cutoffs = [vintages[i] + pd.Timedelta(minutes=int(rng.integers(-10, 10))) for i in range(2, 13)]
    prev = None
    for c in sorted(cutoffs):
        sel = select_forecast_at_cutoff(fc, targets, c)
        assert (sel["publishTime"] <= c).all()
        cur = sel.set_index("startTime")["publishTime"]
        if prev is not None:
            common = cur.index.intersection(prev.index)
            assert (cur.loc[common] >= prev.loc[common]).all()
        prev = cur
