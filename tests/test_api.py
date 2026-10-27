import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture()
def client(fixture_engine):
    app.state.engine = fixture_engine
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_lists_days_and_snapshot(client):
    body = client.get("/api/meta").json()
    assert body["snapshot"]["snapshot_id"].startswith("fixture-")
    assert body["delivery_days"]["decision_in_january"][0] == "2026-01-02"
    assert body["delivery_days"]["delivery_in_january"][0] == "2026-01-01"
    assert body["default_cutoffs"] == ["09:00", "09:20", "09:50", "11:00"]


def test_decision_has_48_points_and_respects_cutoff(client):
    body = client.get("/api/decision", params={"delivery_day": "2026-01-10", "cutoff": "09:20"}).json()
    assert len(body["points"]) == 48
    assert all(p["publish_time"] <= "2026-01-09T09:20:00Z" for p in body["points"])
    assert body["decision_timestamp"] == "2026-01-09T09:20:00Z"
    assert body["points"][0]["actual_mw"] is None  # hidden unless asked for


def test_decision_band_needs_history(client):
    early = client.get("/api/decision", params={"delivery_day": "2026-01-04"}).json()
    assert early["points"][0]["band_low_mw"] is None
    assert "insufficient history" in early["band_status"]
    late = client.get("/api/decision", params={"delivery_day": "2026-01-12"}).json()
    assert late["points"][0]["band_low_mw"] is not None
    assert (
        late["points"][0]["band_low_mw"] <= late["points"][0]["forecast_mw"] <= late["points"][0]["band_high_mw"] + 1e5
    )


def test_later_cutoff_selects_newer_vintage(client):
    a = client.get("/api/decision", params={"delivery_day": "2026-01-10", "cutoff": "09:00"}).json()
    b = client.get("/api/decision", params={"delivery_day": "2026-01-10", "cutoff": "09:50"}).json()
    assert a["vintages"][0]["publish_time"] == "2026-01-09T07:30:00Z"
    assert b["vintages"][0]["publish_time"] == "2026-01-09T09:30:00Z"
    assert b["timeline"]["next_vintage_after_decision"] == "2026-01-09T11:30:00Z"


def test_include_actual_flag_returns_actuals_and_day_metrics(client):
    body = client.get("/api/decision", params={"delivery_day": "2026-01-10", "include_actual": "true"}).json()
    assert body["points"][0]["actual_mw"] is not None and body["day_metrics"]["n"] == 48


def test_lead_mode(client):
    body = client.get("/api/decision", params={"delivery_day": "2026-01-10", "mode": "lead", "lead_hours": 24}).json()
    assert all(p["horizon_h"] >= 24 for p in body["points"])


def test_validation_errors_are_clean(client):
    assert client.get("/api/decision", params={"delivery_day": "2026-01-10", "cutoff": "25:99"}).status_code == 422
    assert client.get("/api/decision", params={"delivery_day": "2026-01-10", "ratio": -1}).status_code == 422
    assert (
        client.get("/api/decision", params={"delivery_day": "2026-01-10", "lead_hours": 99, "mode": "lead"}).status_code
        == 422
    )
    r = client.get("/api/decision", params={"delivery_day": "2030-01-01"})
    assert r.status_code == 404 and "Traceback" not in r.text
    assert client.get("/api/sensitivity", params={"cutoffs": "nope"}).status_code == 422


def test_accuracy_sign_and_counts(client):
    body = client.get("/api/accuracy").json()
    assert body["delivery_days"] == 11  # 2 to 12 Jan
    assert body["headline"]["n"] == 11 * 48
    assert "forecast - actual" in body["sign_convention"]
    first = body["series"][0]
    assert first["t"] == "2026-01-02T00:00:00Z"


def test_sensitivity_groups_cutoffs_by_vintage(client):
    body = client.get("/api/sensitivity").json()
    pairs = {(p["a"], p["b"]): p["share_differs"] for p in body["pairwise"]}
    assert pairs[("09:00", "09:20")] == 0.0
    assert pairs[("09:20", "09:50")] > 0.9
    assert body["hindsight"]["share_after_delivery_start"] >= 0.0


def test_quality_reports_hourly_forecasts_and_full_actuals(client):
    body = client.get("/api/quality").json()
    assert body["forecast_resolution_minutes"] == 60
    assert body["missing_periods"] == 0 and body["duplicate_periods"] == 0
    assert body["targets_without_forecast_share"] == 0


def test_calibration_and_cover_curve(client):
    body = client.get("/api/calibration", params={"ratio": 3}).json()
    assert body["chosen"]["target_quantile"] == 0.75
    assert len(body["cover_curve"]) == 6


def test_receipt_json_and_csv_match(client):
    j = client.get("/api/receipt", params={"delivery_day": "2026-01-10"}).json()
    c = client.get("/api/receipt", params={"delivery_day": "2026-01-10", "format": "csv"})
    assert j["row_count"] == 48 and len(j["input_rows_sha256"]) == 64
    assert c.headers["content-type"].startswith("text/csv")
    assert f"# input_rows_sha256: {j['input_rows_sha256']}" in c.text
    assert j["snapshot_id"].startswith("fixture-")


def test_admin_refresh_is_off_by_default(client):
    assert client.post("/api/admin/refresh").status_code == 404


def test_vercel_entry_point_exposes_the_same_app():
    from api.index import app as vercel_app

    assert vercel_app is app
