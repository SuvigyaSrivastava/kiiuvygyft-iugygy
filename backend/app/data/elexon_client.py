"""Elexon Insights API client and the snapshot writer used by scripts/fetch_data.py."""

import gzip
import hashlib
import json
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

from ..config import (
    ACTUALS_FROM,
    ACTUALS_TO,
    ELEXON_BASE,
    FORECASTS_PUBLISHED_FROM,
    FORECASTS_PUBLISHED_TO,
)

CHUNK_DAYS = 7
PAUSE_SECONDS = 0.5
RETRIES = 4


def _iso(d: date) -> str:
    return f"{d.isoformat()}T00:00:00Z"


def fetch_stream(
    dataset: str,
    publish_from: date,
    publish_to: date,
    fuel_type: str | None = None,
    session: requests.Session | None = None,
) -> tuple[list[dict], list[str]]:
    """Pull `dataset/stream` in weekly windows by publish time. Returns rows and the URLs used."""
    http = session or requests.Session()
    rows: list[dict] = []
    urls: list[str] = []
    cursor = publish_from
    while cursor < publish_to:
        stop = min(cursor + timedelta(days=CHUNK_DAYS), publish_to)
        params = {"publishDateTimeFrom": _iso(cursor), "publishDateTimeTo": _iso(stop)}
        if fuel_type:
            params["fuelType"] = fuel_type
        for attempt in range(RETRIES):
            resp = http.get(f"{ELEXON_BASE}/{dataset}/stream", params=params, timeout=120)
            if resp.status_code == 200:
                break
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < RETRIES - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            resp.raise_for_status()
        urls.append(resp.url)
        rows.extend(resp.json())
        cursor = stop
        time.sleep(PAUSE_SECONDS)
    return rows, urls


def _dedupe(rows: list[dict], keys: tuple[str, ...]) -> list[dict]:
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[tuple(r[k] for k in keys)] = r
    return sorted(seen.values(), key=lambda r: tuple(str(r[k]) for k in keys))


def _canon(rows: list[dict]) -> str:
    return "\n".join(f"{r['startTime']},{r['publishTime']},{r['generation']}" for r in rows)


def build_snapshot(out_dir: Path, session: requests.Session | None = None) -> dict:
    """Fetch both datasets, check them, write gz files and manifest. Same inputs give same files."""
    actual_rows, a_urls = fetch_stream(
        "FUELHH", ACTUALS_FROM - timedelta(days=1), ACTUALS_TO + timedelta(days=1), "WIND", session
    )
    actual_rows = [r for r in actual_rows if r["fuelType"] == "WIND"]
    lo, hi = _iso(ACTUALS_FROM), _iso(ACTUALS_TO)
    actual_rows = _dedupe([r for r in actual_rows if lo <= r["startTime"] < hi], ("startTime",))
    expected = int((ACTUALS_TO - ACTUALS_FROM).days * 48)
    if len(actual_rows) != expected:
        raise RuntimeError(f"FUELHH WIND: expected {expected} half-hours, got {len(actual_rows)}")

    fc_rows, f_urls = fetch_stream("WINDFOR", FORECASTS_PUBLISHED_FROM, FORECASTS_PUBLISHED_TO, None, session)
    flo, fhi = _iso(FORECASTS_PUBLISHED_FROM), _iso(FORECASTS_PUBLISHED_TO)
    fc_rows = _dedupe([r for r in fc_rows if flo <= r["publishTime"] < fhi], ("startTime", "publishTime"))
    vintages = len({r["publishTime"] for r in fc_rows})
    days = (FORECASTS_PUBLISHED_TO - FORECASTS_PUBLISHED_FROM).days
    if vintages < days * 6:
        raise RuntimeError(f"WINDFOR: only {vintages} vintages for {days} days")

    keep = ("dataset", "publishTime", "startTime", "generation")
    out_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict[str, Any]] = {}
    for name, rows, urls, note in (
        (
            "fuelhh_wind",
            [{k: r[k] for k in (*keep, "settlementDate", "settlementPeriod", "fuelType")} for r in actual_rows],
            a_urls,
            f"startTime in [{ACTUALS_FROM}, {ACTUALS_TO})",
        ),
        (
            "windfor",
            [{k: r[k] for k in keep} for r in fc_rows],
            f_urls,
            f"publishTime in [{FORECASTS_PUBLISHED_FROM}, {FORECASTS_PUBLISHED_TO})",
        ),
    ):
        path = out_dir / f"{name}.json.gz"
        payload = json.dumps(rows, separators=(",", ":")).encode()
        with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            gz.write(payload)
        files[name] = {
            "path": f"data/raw/{name}.json.gz",
            "rows": len(rows),
            "kept_filter": note,
            "sha256_canonical_rows": hashlib.sha256(_canon(rows).encode()).hexdigest(),
            "source_urls": urls,
        }
    snapshot_id = hashlib.sha256(
        "|".join(files[k]["sha256_canonical_rows"] for k in sorted(files)).encode()
    ).hexdigest()[:12]
    manifest = {
        "snapshot_id": snapshot_id,
        "fetched_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "api_base": ELEXON_BASE,
        "files": files,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
