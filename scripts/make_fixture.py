"""Cut the committed snapshot down to a 12-day fixture for API tests."""

import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "tests" / "fixtures" / "raw"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((RAW / "manifest.json").read_text())
    with gzip.open(RAW / "fuelhh_wind.json.gz", "rt") as fh:
        actuals = [r for r in json.load(fh) if r["startTime"] < "2026-01-13T00:00:00Z"]
    with gzip.open(RAW / "windfor.json.gz", "rt") as fh:
        forecasts = [r for r in json.load(fh) if r["publishTime"] < "2026-01-13T00:00:00Z"]
    for name, rows in (("fuelhh_wind", actuals), ("windfor", forecasts)):
        with open(OUT / f"{name}.json.gz", "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            gz.write(json.dumps(rows, separators=(",", ":")).encode())
        manifest["files"][name]["rows"] = len(rows)
    manifest["snapshot_id"] = "fixture-" + manifest["snapshot_id"]
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("fixture rows:", len(actuals), len(forecasts))


if __name__ == "__main__":
    main()
