"""Response models. Every endpoint returns one of these."""

from datetime import date, datetime

from pydantic import BaseModel


class Metrics(BaseModel):
    n: int
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    wape: float | None = None
    p50_abs: float | None = None
    p90_abs: float | None = None
    p95_abs: float | None = None
    mean_actual: float | None = None


class LabeledMetrics(Metrics):
    label: str


class LeadMetrics(Metrics):
    from_h: int
    to_h: int


class HistBin(BaseModel):
    from_mw: float
    to_mw: float
    count: int


class WorstDay(BaseModel):
    delivery_day: date
    mae: float | None
    bias: float | None
    max_abs_error: float
    n: int


class SeriesPoint(BaseModel):
    t: datetime
    forecast_mw: float
    actual_mw: float


class Health(BaseModel):
    status: str


class SnapshotInfo(BaseModel):
    snapshot_id: str | None
    fetched_at_utc: str | None
    api_base: str | None
    rows: dict[str, int]
    sources: dict[str, list[str]]


class MetaResponse(BaseModel):
    snapshot: SnapshotInfo
    git_commit: str
    delivery_days: dict[str, list[date]]
    default_scope: str
    default_cutoffs: list[str]
    default_cutoff: str
    default_lag_hours: float
    default_min_history_days: int
    sign_convention: str
    gate_closure_sources: list[dict[str, str]]
    admin_refresh_enabled: bool


class Vintage(BaseModel):
    publish_time: datetime
    targets: int


class Timeline(BaseModel):
    vintages: list[datetime]
    decision_timestamp: datetime
    delivery_start: datetime
    delivery_end: datetime
    next_vintage_after_decision: datetime | None


class DecisionPoint(BaseModel):
    t: datetime
    forecast_mw: float
    publish_time: datetime
    horizon_h: float
    band_low_mw: float | None = None
    band_high_mw: float | None = None
    cover_mw: float | None = None
    actual_mw: float | None = None
    hindsight_forecast_mw: float | None = None


class Window(BaseModel):
    start: datetime
    end: datetime
    mean_mw: float


class DecisionSummary(BaseModel):
    mean_gw: float
    min_gw: float
    max_gw: float
    low_wind_window: Window | None
    highest_cover_window: Window | None
    total_cover_mwh: float | None


class DecisionResponse(BaseModel):
    delivery_day: date
    selection: str
    interp: str
    ratio: float
    target_quantile: float
    decision_timestamp: datetime
    vintages: list[Vintage]
    timeline: Timeline
    band_status: str
    history_days: int
    min_history_days: int
    points: list[DecisionPoint]
    summary: DecisionSummary
    day_metrics: Metrics | None
    flat_demand_mw: float | None = None
    remaining_need_mw: float | None = None


class AccuracyResponse(BaseModel):
    scope: str
    selection: str
    delivery_days: int
    sign_convention: str
    headline: Metrics
    headline_excluding_flagged: Metrics
    flagged_periods: int
    by_hour: list[LabeledMetrics]
    by_level: list[LabeledMetrics]
    level_edges_mw: list[float]
    by_horizon: list[LabeledMetrics]
    error_vs_lead: list[LeadMetrics]
    histogram: list[HistBin]
    worst_days: list[WorstDay]
    series: list[SeriesPoint]
    capacity_note: str


class CutoffResult(BaseModel):
    cutoff: str
    metrics: Metrics
    vintage_share: dict[str, float]
    targets_without_forecast: int


class PairDiff(BaseModel):
    a: str
    b: str
    share_differs: float


class LeadResult(BaseModel):
    lead_hours: float
    metrics: Metrics


class HindsightComparison(BaseModel):
    cutoff: str
    decision_time: Metrics
    latest_ever: Metrics
    share_after_delivery_start: float
    mae_gap_mw: float | None


class SensitivityResponse(BaseModel):
    scope: str
    cutoffs: list[CutoffResult]
    pairwise: list[PairDiff]
    lead_curve: list[LeadResult]
    hindsight: HindsightComparison
    finding: str


class DayQuality(BaseModel):
    day: date
    periods: int
    expected: int


class QualityResponse(BaseModel):
    scope: str
    actuals_rows: int
    missing_periods: int
    duplicate_periods: int
    nonpositive_actuals: int
    late_published_actuals: int
    per_day: list[DayQuality]
    forecast_rows: int
    forecast_vintages: int
    forecast_resolution_minutes: int | None
    usual_publish_times_utc: list[str]
    irregular_publish_times: list[str]
    forecast_duplicate_rows: int
    forecast_nonpositive: int
    targets_without_forecast_share: float
    headline: Metrics
    headline_excluding_flagged: Metrics
    caveats: list[str]
    assumptions: list[str]


class BucketCalibration(BaseModel):
    bucket: str
    n: int
    coverage: float
    below: float
    above: float


class DayCalibration(BaseModel):
    delivery_day: date
    n: int
    coverage: float | None
    below: float | None
    above: float | None


class Calibration(BaseModel):
    nominal: float
    n: int
    coverage: float | None
    below: float | None
    above: float | None
    days_scored: int
    days_without_band: int
    by_bucket: list[BucketCalibration]
    per_day: list[DayCalibration]
    worst_days: list[DayCalibration]


class CoverBacktest(BaseModel):
    ratio: float
    target_quantile: float
    n: int
    share_short: float | None
    extra_mwh_bought: float
    extra_mwh_unused: float
    remaining_shortfall_mwh: float


class CalibrationResponse(BaseModel):
    scope: str
    selection: str
    lag_hours: float
    min_history_days: int
    calibration: Calibration
    cover_curve: list[CoverBacktest]
    chosen: CoverBacktest
    finding: str


class MonthDay(BaseModel):
    delivery_day: date
    mean_gw: float | None
    min_gw: float | None
    max_gw: float | None
    forecast_issued: datetime | None


class MonthResponse(BaseModel):
    scope: str
    selection: str
    days: list[MonthDay]
