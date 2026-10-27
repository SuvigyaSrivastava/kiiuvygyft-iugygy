"""Recompute a decision receipt from the committed snapshot and check it.

    python scripts/verify_receipt.py receipt_2026-01-15_0920.json

Checks: the snapshot id matches, the selected forecast rows are what the selection rule picks
from the snapshot, and the SHA-256 of the canonical rows matches the receipt.
"""

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app import config  # noqa: E402
from backend.app.data.loader import load_snapshot  # noqa: E402
from backend.app.domain.receipt import rows_sha256  # noqa: E402
from backend.app.engine import Engine, Spec  # noqa: E402


def verify(receipt: dict, raw_dir: Path) -> list[str]:
    snap = load_snapshot(raw_dir)
    engine = Engine(snap)
    problems: list[str] = []
    if receipt.get("snapshot_id") != snap.manifest.get("snapshot_id"):
        problems.append(
            f"snapshot id differs: receipt {receipt.get('snapshot_id')}, local {snap.manifest.get('snapshot_id')}"
        )
    spec = Spec(
        mode=receipt["selection_mode"],
        cutoff=receipt.get("cutoff_london") or config.DEFAULT_CUTOFF,
        lead_hours=receipt.get("min_lead_hours") or 0.0,
        interp=receipt["hourly_to_half_hourly"],
    )
    day = date.fromisoformat(receipt["delivery_day"])
    rows = engine.select_day(day, spec).dropna(subset=["actual"])
    limit = engine.decision_ts(day, spec)
    if spec.mode == "cutoff" and (rows["publishTime"] > limit).any():
        problems.append("a selected forecast was published after the decision timestamp")
    if rows_sha256(rows) != receipt["input_rows_sha256"]:
        problems.append("recomputed row hash does not match the receipt")
    if len(rows) != receipt["row_count"]:
        problems.append(f"row count differs: receipt {receipt['row_count']}, recomputed {len(rows)}")
    for mine, theirs in zip(rows.itertuples(), receipt["rows"], strict=False):
        if abs(round(float(mine.forecast), 3) - theirs["forecast_mw"]) > 1e-6:
            problems.append(f"forecast differs at {theirs['startTime']}")
            break
    return problems


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    receipt = json.loads(Path(sys.argv[1]).read_text())
    problems = verify(receipt, config.RAW_DIR)
    if problems:
        print("FAILED")
        for p in problems:
            print(" -", p)
        return 1
    print(
        f"OK: {receipt['row_count']} rows, sha256 {receipt['input_rows_sha256'][:16]}..., snapshot {receipt['snapshot_id']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
