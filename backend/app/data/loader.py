"""Reads the committed snapshot. No network access here."""

import gzip
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class Snapshot:
    actuals: pd.DataFrame  # startTime, publishTime, generation
    forecasts: pd.DataFrame  # startTime, publishTime, generation (hourly rows)
    manifest: dict


def _frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for col in ("startTime", "publishTime"):
        df[col] = pd.to_datetime(df[col], utc=True).dt.as_unit("ns")
    df["generation"] = df["generation"].astype(float)
    return (
        df[["startTime", "publishTime", "generation"]]
        .sort_values(["startTime", "publishTime"], kind="stable")
        .reset_index(drop=True)
    )


def load_snapshot(raw_dir: Path) -> Snapshot:
    manifest = json.loads((raw_dir / "manifest.json").read_text())
    with gzip.open(raw_dir / "fuelhh_wind.json.gz", "rt") as fh:
        actuals = _frame(json.load(fh))
    with gzip.open(raw_dir / "windfor.json.gz", "rt") as fh:
        forecasts = _frame(json.load(fh))
    return Snapshot(actuals=actuals, forecasts=forecasts, manifest=manifest)
