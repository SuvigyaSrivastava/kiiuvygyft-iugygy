"""Refresh the committed snapshot from the live Elexon API.

python scripts/fetch_data.py [--out data/raw]
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.data.elexon_client import build_snapshot  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "raw"))
    args = ap.parse_args()
    manifest = build_snapshot(Path(args.out))
    print(f"snapshot {manifest['snapshot_id']} fetched {manifest['fetched_at_utc']}")
    for name, f in manifest["files"].items():
        print(f"  {name}: {f['rows']} rows, {len(f['source_urls'])} requests")


if __name__ == "__main__":
    main()
