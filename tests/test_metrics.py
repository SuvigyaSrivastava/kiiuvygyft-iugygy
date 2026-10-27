import numpy as np
import pandas as pd
import pytest

from backend.app.domain import metrics


def frame(forecast, actual, horizon=None):
    df = pd.DataFrame({"forecast": forecast, "actual": actual})
    if horizon is not None:
        df["horizon_h"] = horizon
    return metrics.add_error(df)


def test_sign_convention_over_forecast_is_positive():
    df = frame([110.0], [100.0])
    assert df["error"].iloc[0] == 10.0


def test_headline_metrics_hand_computed():
    df = frame([10, 12, 8], [9, 15, 8])  # errors 1, -3, 0
    s = metrics.summarize(df)
    assert s["n"] == 3
    assert s["mae"] == pytest.approx(4 / 3)
    assert s["rmse"] == pytest.approx(np.sqrt(10 / 3))
    assert s["bias"] == pytest.approx(-2 / 3)
    assert s["wape"] == pytest.approx(4 / 32)
    assert s["p50_abs"] == 1.0


def test_percentiles_of_absolute_error():
    df = frame(list(range(1, 101)), [0] * 100)
    s = metrics.summarize(df)
    assert s["p90_abs"] == pytest.approx(np.quantile(range(1, 101), 0.9))
    assert s["p95_abs"] == pytest.approx(np.quantile(range(1, 101), 0.95))


def test_empty_frame_gives_nones_not_nan():
    s = metrics.summarize(frame([], []))
    assert s["n"] == 0 and s["mae"] is None


def test_level_bucket_edges_go_to_higher_bucket():
    edges = [10.0, 20.0]
    assert metrics.level_bucket([5, 10, 15, 20, 25], edges).tolist() == [0, 1, 1, 2, 2]


def test_terciles_split_evenly():
    edges = metrics.tercile_edges(np.arange(90))
    b = metrics.level_bucket(np.arange(90), edges)
    assert [int((b == i).sum()) for i in range(3)] == [30, 30, 30]


def test_horizon_buckets():
    df = frame([1, 1, 1], [0, 0, 0], horizon=[11.9, 12.0, 45.0])
    rows = {r["bucket"]: r["n"] for r in metrics.by_horizon(df)}
    assert rows == {"<12 h": 1, "12-18 h": 1, "42+ h": 1}
