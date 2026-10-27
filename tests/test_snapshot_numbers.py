"""Pins the headline numbers on the committed snapshot so every figure in the docs is reproducible."""

import pytest

from backend.app import config
from backend.app.data.loader import load_snapshot
from backend.app.domain import bands, metrics
from backend.app.engine import Engine, Spec


@pytest.fixture(scope="module")
def engine():
    return Engine(load_snapshot(config.RAW_DIR))


def test_snapshot_is_complete(engine):
    assert len(engine.all_days) == 32
    assert len(engine.scope_days("decision_in_january")) == 31
    assert len(engine.scope_days("delivery_in_january")) == 31


def test_headline_numbers_at_0920(engine):
    s = metrics.summarize(engine.scoped(Spec(cutoff="09:20"), "decision_in_january"))
    assert s["n"] == 1488
    assert s["mae"] == pytest.approx(2042.0, abs=1.0)
    assert s["bias"] == pytest.approx(1747.9, abs=1.0)


def test_0900_and_0920_select_identical_vintages_and_0950_differs(engine):
    a = engine.scoped(Spec(cutoff="09:00"), "decision_in_january")["publishTime"].reset_index(drop=True)
    b = engine.scoped(Spec(cutoff="09:20"), "decision_in_january")["publishTime"].reset_index(drop=True)
    c = engine.scoped(Spec(cutoff="09:50"), "decision_in_january")["publishTime"].reset_index(drop=True)
    assert (a == b).all() and (a != c).all()


def test_walk_forward_coverage_is_near_nominal(engine):
    spec = Spec()
    cal = bands.calibration(
        engine.error_table(spec), engine.models(spec, 1.0, 7), engine.scope_days("decision_in_january")
    )
    assert cal["days_scored"] == 24 and cal["days_without_band"] == 7
    assert cal["coverage"] == pytest.approx(0.7977, abs=0.001)
