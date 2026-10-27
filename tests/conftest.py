import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

FIXTURE_RAW = ROOT / "tests" / "fixtures" / "raw"


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC").as_unit("ns")


def forecast_rows(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """(startTime, publishTime, generation) triples as a WINDFOR-style frame."""
    return pd.DataFrame(
        {
            "startTime": pd.DatetimeIndex([ts(r[0]) for r in rows]),
            "publishTime": pd.DatetimeIndex([ts(r[1]) for r in rows]),
            "generation": [float(r[2]) for r in rows],
        }
    )


@pytest.fixture(scope="session")
def fixture_engine():  # type: ignore[no-untyped-def]
    from backend.app.data.loader import load_snapshot
    from backend.app.engine import Engine

    return Engine(load_snapshot(FIXTURE_RAW))


def vintage_rows(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """Same as forecast_rows but already half-hourly, so the column is `forecast`."""
    return forecast_rows(rows).rename(columns={"generation": "forecast"})
