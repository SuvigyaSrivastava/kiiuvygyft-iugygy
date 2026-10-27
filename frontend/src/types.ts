export interface Metrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  wape: number | null;
  p50_abs: number | null;
  p90_abs: number | null;
  p95_abs: number | null;
  mean_actual: number | null;
}
export interface LabeledMetrics extends Metrics { label: string }
export interface LeadMetrics extends Metrics { from_h: number; to_h: number }

export interface Meta {
  snapshot: { snapshot_id: string | null; fetched_at_utc: string | null; api_base: string | null; rows: Record<string, number>; sources: Record<string, string[]> };
  git_commit: string;
  delivery_days: { decision_in_january: string[]; delivery_in_january: string[] };
  default_scope: Scope;
  default_cutoffs: string[];
  default_cutoff: string;
  default_lag_hours: number;
  default_min_history_days: number;
  sign_convention: string;
  gate_closure_sources: { name: string; note: string; url: string }[];
  admin_refresh_enabled: boolean;
}

export type Scope = "decision_in_january" | "delivery_in_january";

export interface DecisionPoint {
  t: string;
  forecast_mw: number;
  publish_time: string;
  horizon_h: number;
  band_low_mw: number | null;
  band_high_mw: number | null;
  cover_mw: number | null;
  actual_mw: number | null;
  hindsight_forecast_mw: number | null;
}
export interface Window { start: string; end: string; mean_mw: number }
export interface Decision {
  delivery_day: string;
  selection: string;
  interp: string;
  ratio: number;
  target_quantile: number;
  decision_timestamp: string;
  vintages: { publish_time: string; targets: number }[];
  timeline: { vintages: string[]; decision_timestamp: string; delivery_start: string; delivery_end: string; next_vintage_after_decision: string | null };
  band_status: string;
  history_days: number;
  min_history_days: number;
  points: DecisionPoint[];
  summary: { mean_gw: number; min_gw: number; max_gw: number; low_wind_window: Window | null; highest_cover_window: Window | null; total_cover_mwh: number | null };
  day_metrics: Metrics | null;
  flat_demand_mw: number | null;
  remaining_need_mw: number | null;
}

export interface Accuracy {
  scope: Scope;
  selection: string;
  delivery_days: number;
  sign_convention: string;
  headline: Metrics;
  headline_excluding_flagged: Metrics;
  flagged_periods: number;
  by_hour: LabeledMetrics[];
  by_level: LabeledMetrics[];
  level_edges_mw: number[];
  by_horizon: LabeledMetrics[];
  error_vs_lead: LeadMetrics[];
  histogram: { from_mw: number; to_mw: number; count: number }[];
  worst_days: { delivery_day: string; mae: number | null; bias: number | null; max_abs_error: number; n: number }[];
  series: { t: string; forecast_mw: number; actual_mw: number }[];
  capacity_note: string;
}

export interface Sensitivity {
  scope: Scope;
  cutoffs: { cutoff: string; metrics: Metrics; vintage_share: Record<string, number>; targets_without_forecast: number }[];
  pairwise: { a: string; b: string; share_differs: number }[];
  lead_curve: { lead_hours: number; metrics: Metrics }[];
  hindsight: { cutoff: string; decision_time: Metrics; latest_ever: Metrics; share_after_delivery_start: number; mae_gap_mw: number | null };
  finding: string;
}

export interface Quality {
  scope: Scope;
  actuals_rows: number;
  missing_periods: number;
  duplicate_periods: number;
  nonpositive_actuals: number;
  late_published_actuals: number;
  per_day: { day: string; periods: number; expected: number }[];
  forecast_rows: number;
  forecast_vintages: number;
  forecast_resolution_minutes: number | null;
  usual_publish_times_utc: string[];
  irregular_publish_times: string[];
  forecast_duplicate_rows: number;
  forecast_nonpositive: number;
  targets_without_forecast_share: number;
  headline: Metrics;
  headline_excluding_flagged: Metrics;
  caveats: string[];
  assumptions: string[];
}

export interface DayCalibration { delivery_day: string; n: number; coverage: number | null; below: number | null; above: number | null }
export interface CoverBacktest { ratio: number; target_quantile: number; n: number; share_short: number | null; extra_mwh_bought: number; extra_mwh_unused: number; remaining_shortfall_mwh: number }
export interface CalibrationResp {
  scope: Scope;
  selection: string;
  lag_hours: number;
  min_history_days: number;
  calibration: {
    nominal: number; n: number; coverage: number | null; below: number | null; above: number | null;
    days_scored: number; days_without_band: number;
    by_bucket: { bucket: string; n: number; coverage: number; below: number; above: number }[];
    per_day: DayCalibration[]; worst_days: DayCalibration[];
  };
  cover_curve: CoverBacktest[];
  chosen: CoverBacktest;
  finding: string;
}
