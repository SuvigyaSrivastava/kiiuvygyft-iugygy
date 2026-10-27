from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from backend.app.domain import bands
from backend.app.domain.timeutil import half_hour_targets, london_day_bounds_utc
from tests.conftest import ts


def make_errtab(n_days=10, seed=1, base=date(2026, 1, 1)):
    rng = np.random.default_rng(seed)
    frames = []
    for i in range(n_days):
        d = base + timedelta(days=i)
        idx = half_hour_targets(d)
        fc = rng.uniform(2000, 18000, len(idx))
        err = rng.normal(500, 1500, len(idx))
        frames.append(
            pd.DataFrame(
                {
                    "delivery_day": d,
                    "startTime": idx,
                    "forecast": fc,
                    "actual": fc - err,
                    "error": err,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def test_history_respects_lag_and_decision_time():
    tab = make_errtab(5)
    # Decision at 09:20 on 4 Jan. Day 3 Jan ends 4 Jan 00:00, plus 1 h lag = 01:00, so it is in. Day 4 Jan is not.
    ts_ = ts("2026-01-04 09:20")
    hist = bands.eligible_history(tab, ts_, 1.0)
    assert sorted(hist["delivery_day"].unique()) == [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)]
    # A long lag pushes the latest day out.
    hist = bands.eligible_history(tab, ts_, 10.0)
    assert date(2026, 1, 3) not in set(hist["delivery_day"])


def test_day_ending_exactly_at_decision_time_with_zero_lag_is_in():
    tab = make_errtab(3)
    end = london_day_bounds_utc(date(2026, 1, 1))[1]
    assert date(2026, 1, 1) in set(bands.eligible_history(tab, end, 0.0)["delivery_day"])
    assert date(2026, 1, 1) not in set(bands.eligible_history(tab, end - pd.Timedelta(minutes=1), 0.0)["delivery_day"])


def test_insufficient_history_gives_no_model():
    tab = make_errtab(10)
    assert bands.fit_band_model(tab[tab["delivery_day"] < date(2026, 1, 7)], 7) is None
    assert bands.fit_band_model(tab[tab["delivery_day"] < date(2026, 1, 8)], 7) is not None


def test_walk_forward_ignores_future_actuals():
    tab = make_errtab(12)
    decision = lambda d: ts(f"{d - timedelta(days=1)} 09:20")  # noqa: E731
    base = bands.walk_forward_models(tab, decision, 1.0, 7)
    day = date(2026, 1, 10)
    tampered = tab.copy()
    future = tampered["delivery_day"] >= day  # the decision day's own delivery day and later
    tampered.loc[future, "actual"] = 0.0
    tampered.loc[future, "error"] = tampered.loc[future, "forecast"]
    again = bands.walk_forward_models(tampered, decision, 1.0, 7)
    for d in (date(2026, 1, 9), day, date(2026, 1, 11)):
        a, b = base[d], again[d]
        assert a is not None and b is not None
        assert a.edges == b.edges
        assert all(np.array_equal(x, y) for x, y in zip(a.errors, b.errors, strict=True))


def test_band_is_forecast_minus_error_quantiles():
    err = np.arange(100, dtype=float)  # 0..99
    model = bands.BandModel(edges=[1e9, 2e9], errors=[err, err, err], pooled=err, n_days=7)
    fc = pd.Series([1000.0])
    band = bands.band_for(model, fc, 0.1, 0.9)
    assert band["band_low"].iloc[0] == pytest.approx(1000 - np.quantile(err, 0.9))
    assert band["band_high"].iloc[0] == pytest.approx(1000 - np.quantile(err, 0.1))


def test_cover_uses_ratio_quantile_and_is_never_negative():
    err = np.arange(-100, 101, dtype=float)
    model = bands.BandModel(edges=[1e9, 2e9], errors=[err, err, err], pooled=err, n_days=7)
    fc = pd.Series([1000.0])
    assert bands.cover_for_ratio(model, fc, 3.0)[0] == pytest.approx(np.quantile(err, 0.75))
    assert bands.cover_for_ratio(model, fc, 0.01)[0] == 0.0  # q about 0.01 -> negative quantile floors to 0
    with pytest.raises(ValueError):
        bands.cover_for_ratio(model, fc, 0)


def test_small_bucket_falls_back_to_pooled():
    pooled = np.arange(1000, dtype=float)
    model = bands.BandModel(edges=[10.0, 20.0], errors=[np.array([5.0]), pooled, pooled], pooled=pooled, n_days=7)
    q = model.error_quantile(np.array([0]), 0.5)
    assert q[0] == pytest.approx(np.quantile(pooled, 0.5))


def test_calibration_counts_inside_below_above():
    day = date(2026, 1, 9)
    idx = half_hour_targets(day)[:4]
    err = np.arange(100, dtype=float)
    model = bands.BandModel(edges=[1e9, 2e9], errors=[err, err, err], pooled=err, n_days=7)
    # forecast 1000: band for actual is [1000-89.1, 1000-9.9]
    tab = pd.DataFrame(
        {"delivery_day": day, "startTime": idx, "forecast": 1000.0, "actual": [950.0, 500.0, 1100.0, 920.0]}
    )
    tab["error"] = tab["forecast"] - tab["actual"]
    out = bands.calibration(tab, {day: model}, [day])
    assert out["n"] == 4
    assert out["coverage"] == 0.5 and out["below"] == 0.25 and out["above"] == 0.25
