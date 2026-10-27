import type { Accuracy, CalibrationResp, Decision, Meta, Quality, Sensitivity } from "../types";

const m = { n: 96, mae: 2000, rmse: 2500, bias: 1700, wape: 0.18, p50_abs: 1600, p90_abs: 4100, p95_abs: 5300, mean_actual: 11000 };

export const meta: Meta = {
  snapshot: { snapshot_id: "abc123", fetched_at_utc: "2026-10-27T14:29:40Z", api_base: "https://example.test", rows: { fuelhh_wind: 1536 }, sources: {} },
  git_commit: "deadbeef",
  delivery_days: { decision_in_january: ["2026-01-14", "2026-01-15", "2026-01-16"], delivery_in_january: ["2026-01-14", "2026-01-15", "2026-01-16"] },
  default_scope: "decision_in_january",
  default_cutoffs: ["09:00", "09:20", "09:50", "11:00"],
  default_cutoff: "09:20",
  default_lag_hours: 1,
  default_min_history_days: 7,
  sign_convention: "error = forecast - actual",
  gate_closure_sources: [],
  admin_refresh_enabled: false,
};

const pts = Array.from({ length: 4 }, (_, i) => ({
  t: `2026-01-15T0${i}:00:00Z`, forecast_mw: 10000 + i * 100, publish_time: "2026-01-14T07:30:00Z", horizon_h: 17 + i,
  band_low_mw: 8000, band_high_mw: 12000, cover_mw: 900, actual_mw: null, hindsight_forecast_mw: null,
}));

export const decision: Decision = {
  delivery_day: "2026-01-15", selection: "cutoff 09:20 London", interp: "hold", ratio: 3, target_quantile: 0.75,
  decision_timestamp: "2026-01-14T09:20:00Z", vintages: [{ publish_time: "2026-01-14T07:30:00Z", targets: 4 }],
  timeline: { vintages: ["2026-01-14T07:30:00Z", "2026-01-14T09:30:00Z"], decision_timestamp: "2026-01-14T09:20:00Z", delivery_start: "2026-01-15T00:00:00Z", delivery_end: "2026-01-16T00:00:00Z", next_vintage_after_decision: "2026-01-14T09:30:00Z" },
  band_status: "band from 13 earlier delivery days", history_days: 13, min_history_days: 7, points: pts,
  summary: { mean_gw: 11.6, min_gw: 8.9, max_gw: 15.8, low_wind_window: { start: "2026-01-15T16:00:00Z", end: "2026-01-15T19:00:00Z", mean_mw: 8900 }, highest_cover_window: { start: "2026-01-15T12:00:00Z", end: "2026-01-15T15:00:00Z", mean_mw: 1800 }, total_cover_mwh: 41118 },
  day_metrics: null, flat_demand_mw: null, remaining_need_mw: null,
};

export const accuracy: Accuracy = {
  scope: "decision_in_january", selection: "cutoff 09:20 London", delivery_days: 31, sign_convention: "error = forecast - actual", headline: m, headline_excluding_flagged: m, flagged_periods: 0,
  by_hour: [{ label: "00:00", ...m }], by_level: [{ label: "low forecast", ...m }], level_edges_mw: [8000, 13000], by_horizon: [{ label: "12-18 h", ...m }],
  error_vs_lead: [{ from_h: 0, to_h: 3, ...m }], histogram: [{ from_mw: -500, to_mw: 0, count: 5 }, { from_mw: 0, to_mw: 500, count: 7 }],
  worst_days: [{ delivery_day: "2026-01-08", mae: 3500, bias: 2500, max_abs_error: 7000, n: 48 }],
  series: [{ t: "2026-01-15T00:00:00Z", forecast_mw: 10000, actual_mw: 9000 }], capacity_note: "n/a",
};

export const sensitivity: Sensitivity = {
  scope: "decision_in_january", cutoffs: [{ cutoff: "09:20", metrics: m, vintage_share: { "07:30": 1 }, targets_without_forecast: 0 }, { cutoff: "09:50", metrics: m, vintage_share: { "09:30": 1 }, targets_without_forecast: 0 }],
  pairwise: [{ a: "09:20", b: "09:50", share_differs: 1 }], lead_curve: [{ lead_hours: 0, metrics: m }],
  hindsight: { cutoff: "09:20", decision_time: m, latest_ever: { ...m, mae: 500 }, share_after_delivery_start: 0.3, mae_gap_mw: 1500 }, finding: "2 cutoffs produce 2 distinct selections.",
};

export const quality: Quality = {
  scope: "decision_in_january", actuals_rows: 1488, missing_periods: 0, duplicate_periods: 0, nonpositive_actuals: 0, late_published_actuals: 3,
  per_day: [{ day: "2026-01-15", periods: 48, expected: 48 }], forecast_rows: 100, forecast_vintages: 8, forecast_resolution_minutes: 60,
  usual_publish_times_utc: ["07:30"], irregular_publish_times: [], forecast_duplicate_rows: 0, forecast_nonpositive: 0, targets_without_forecast_share: 0,
  headline: m, headline_excluding_flagged: m, caveats: ["Metered output is after curtailment."], assumptions: ["Times are UTC."],
};

export const calibration: CalibrationResp = {
  scope: "decision_in_january", selection: "cutoff 09:20 London", lag_hours: 1, min_history_days: 7,
  calibration: { nominal: 0.8, n: 100, coverage: 0.798, below: 0.12, above: 0.08, days_scored: 24, days_without_band: 7, by_bucket: [{ bucket: "mid forecast", n: 50, coverage: 0.64, below: 0.26, above: 0.1 }], per_day: [{ delivery_day: "2026-01-15", n: 48, coverage: 0.8, below: 0.1, above: 0.1 }], worst_days: [] },
  cover_curve: [{ ratio: 3, target_quantile: 0.75, n: 100, share_short: 0.28, extra_mwh_bought: 1000, extra_mwh_unused: 500, remaining_shortfall_mwh: 200 }],
  chosen: { ratio: 3, target_quantile: 0.75, n: 100, share_short: 0.28, extra_mwh_bought: 1000, extra_mwh_unused: 500, remaining_shortfall_mwh: 200 },
  finding: "Out of sample the band held 79.8%.",
};
