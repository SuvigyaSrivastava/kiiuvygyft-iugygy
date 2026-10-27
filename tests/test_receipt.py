import pandas as pd

from backend.app.domain.receipt import build_receipt, receipt_to_csv, rows_sha256
from tests.conftest import ts


def rows():
    return pd.DataFrame(
        {
            "startTime": pd.DatetimeIndex([ts("2026-01-02 00:00"), ts("2026-01-02 00:30")]),
            "publishTime": pd.DatetimeIndex([ts("2026-01-01 07:30")] * 2),
            "forecast": [100.0, 110.5],
            "actual": [90.0, 95.0],
        }
    )


def test_hash_is_stable_and_order_independent():
    a = rows()
    assert rows_sha256(a) == rows_sha256(a.iloc[::-1].reset_index(drop=True))
    assert len(rows_sha256(a)) == 64


def test_hash_changes_when_a_value_changes():
    a, b = rows(), rows()
    b.loc[0, "forecast"] = 100.001
    assert rows_sha256(a) != rows_sha256(b)


def test_header_does_not_affect_row_hash_and_csv_has_header_lines():
    r1 = build_receipt(rows(), {"cutoff_london": "09:20", "assumptions": ["a", "b"]})
    r2 = build_receipt(rows(), {"cutoff_london": "11:00", "assumptions": []})
    assert r1["input_rows_sha256"] == r2["input_rows_sha256"]
    csv = receipt_to_csv(r1)
    assert csv.startswith("# cutoff_london: 09:20")
    assert "startTime,publishTime,forecast_mw,actual_mw\n2026-01-02T00:00:00Z" in csv


def test_verify_script_accepts_a_fresh_receipt_and_rejects_a_tampered_one(fixture_engine, tmp_path):
    import json
    from datetime import date

    from backend.app.engine import Spec
    from scripts.verify_receipt import verify
    from tests.conftest import FIXTURE_RAW

    rec = fixture_engine.build_receipt(date(2026, 1, 10), Spec())
    assert verify(json.loads(json.dumps(rec)), FIXTURE_RAW) == []
    rec["rows"][3]["forecast_mw"] += 1
    rec["input_rows_sha256"] = "0" * 64
    assert verify(rec, FIXTURE_RAW)
