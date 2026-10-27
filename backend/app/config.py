import os
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = Path(os.environ.get("RAW_DIR", ROOT / "data" / "raw"))

ELEXON_BASE = os.environ.get("ELEXON_BASE", "https://data.elexon.co.uk/bmrs/api/v1/datasets")

# Snapshot window. Actuals are kept by startTime, forecasts by publishTime.
ACTUALS_FROM = date(2026, 1, 1)
ACTUALS_TO = date(2026, 2, 2)  # exclusive
FORECASTS_PUBLISHED_FROM = date(2025, 12, 30)
FORECASTS_PUBLISHED_TO = date(2026, 2, 2)  # exclusive

DEFAULT_CUTOFFS = ["09:00", "09:20", "09:50", "11:00"]
DEFAULT_CUTOFF = "09:20"
DEFAULT_LAG_HOURS = 1.0
DEFAULT_MIN_HISTORY_DAYS = 7

# Off by default. Only enable on a machine you control.
ENABLE_ADMIN_REFRESH = os.environ.get("ENABLE_ADMIN_REFRESH", "0") == "1"


def git_commit() -> str:
    env = os.environ.get("GIT_COMMIT") or os.environ.get("VERCEL_GIT_COMMIT_SHA")
    if env:
        return env[:12]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"
