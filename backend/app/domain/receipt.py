"""Decision receipt: the exact rows behind a decision, plus a hash anyone can recompute."""

import hashlib
import io
import json
from typing import Any

import pandas as pd

COLUMNS = ["startTime", "publishTime", "forecast", "actual"]


def _ts(value: pd.Timestamp) -> str:
    return pd.Timestamp(value).tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def canonical_rows(rows: pd.DataFrame) -> str:
    """One line per half-hour, sorted by startTime, fixed formats. The input to the hash."""
    ordered = rows.sort_values("startTime")
    lines = [f"{_ts(r.startTime)},{_ts(r.publishTime)},{r.forecast:.3f},{r.actual:.3f}" for r in ordered.itertuples()]
    return "\n".join(lines)


def rows_sha256(rows: pd.DataFrame) -> str:
    return hashlib.sha256(canonical_rows(rows).encode("utf-8")).hexdigest()


def build_receipt(rows: pd.DataFrame, header: dict[str, Any]) -> dict[str, Any]:
    """`header` carries everything that is not derived from the rows (cutoff, snapshot, urls, commit)."""
    ordered = rows.sort_values("startTime")
    return {
        **header,
        "input_rows_sha256": rows_sha256(rows),
        "row_count": len(ordered),
        "rows": [
            {
                "startTime": _ts(r.startTime),
                "publishTime": _ts(r.publishTime),
                "forecast_mw": round(float(r.forecast), 3),
                "actual_mw": round(float(r.actual), 3),
            }
            for r in ordered.itertuples()
        ],
    }


def receipt_to_csv(receipt: dict[str, Any]) -> str:
    buf = io.StringIO()
    for key, value in receipt.items():
        if key == "rows":
            continue
        buf.write(f"# {key}: {value if isinstance(value, str) else json.dumps(value)}\n")
    buf.write("startTime,publishTime,forecast_mw,actual_mw\n")
    for r in receipt["rows"]:
        buf.write(f"{r['startTime']},{r['publishTime']},{r['forecast_mw']},{r['actual_mw']}\n")
    return buf.getvalue()
