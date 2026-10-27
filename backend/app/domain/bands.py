"""Walk-forward error bands, calibration and the risk-ratio cover rule.

Rules that prevent leakage:
- A delivery day only enters the history for decision timestamp T if its last half-hour
  plus the publication lag is at or before T.
- Level buckets (terciles of forecast) are computed from that history only.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from .metrics import level_bucket, tercile_edges
from .timeutil import london_day_bounds_utc

MIN_BUCKET_SIZE = 20


@dataclass(frozen=True)
class BandModel:
    edges: list[float]
    errors: list[np.ndarray]
    pooled: np.ndarray
    n_days: int

    def bucket_of(self, forecast: np.ndarray | pd.Series) -> np.ndarray:
        return level_bucket(forecast, self.edges)

    def error_quantile(self, buckets: np.ndarray, q: float) -> np.ndarray:
        per_bucket = []
        for b in range(len(self.errors)):
            sample = self.errors[b] if len(self.errors[b]) >= MIN_BUCKET_SIZE else self.pooled
            per_bucket.append(float(np.quantile(sample, q)))
        return np.asarray(per_bucket)[buckets]


def eligible_history(errtab: pd.DataFrame, decision_ts: pd.Timestamp, lag_hours: float) -> pd.DataFrame:
    """Rows of delivery days whose actuals were fully available before decision_ts."""
    lag = pd.Timedelta(hours=lag_hours)
    keep = [d for d in errtab["delivery_day"].unique() if london_day_bounds_utc(d)[1] + lag <= decision_ts]
    return errtab[errtab["delivery_day"].isin(keep)]


def fit_band_model(history: pd.DataFrame, min_history_days: int) -> BandModel | None:
    n_days = history["delivery_day"].nunique() if len(history) else 0
    if n_days < min_history_days:
        return None
    edges = tercile_edges(history["forecast"])
    buckets = level_bucket(history["forecast"], edges)
    err = history["error"].to_numpy(dtype=float)
    return BandModel(
        edges=edges,
        errors=[err[buckets == b] for b in range(3)],
        pooled=err,
        n_days=int(n_days),
    )


def walk_forward_models(
    errtab: pd.DataFrame,
    decision_ts_for_day: Callable[[date], pd.Timestamp],
    lag_hours: float,
    min_history_days: int,
) -> dict[date, BandModel | None]:
    models: dict[date, BandModel | None] = {}
    for day in sorted(errtab["delivery_day"].unique()):
        hist = eligible_history(errtab, decision_ts_for_day(day), lag_hours)
        models[day] = fit_band_model(hist, min_history_days)
    return models


def band_for(model: BandModel, forecast: pd.Series, lo_q: float = 0.1, hi_q: float = 0.9) -> pd.DataFrame:
    """Band on actual wind: actual = forecast - error, so the high error quantile gives the low edge."""
    b = model.bucket_of(forecast)
    lo = forecast.to_numpy(dtype=float) - model.error_quantile(b, hi_q)
    hi = forecast.to_numpy(dtype=float) - model.error_quantile(b, lo_q)
    return pd.DataFrame({"band_low": lo, "band_high": hi, "bucket": b}, index=forecast.index)


def cover_for_ratio(model: BandModel, forecast: pd.Series, ratio: float) -> np.ndarray:
    """Extra MW to buy: the q-quantile of over-forecast error for the bucket, never negative."""
    if ratio <= 0:
        raise ValueError("ratio must be positive")
    q = ratio / (1 + ratio)
    b = model.bucket_of(forecast)
    return np.maximum(0.0, model.error_quantile(b, q))


def calibration(errtab: pd.DataFrame, models: dict[date, BandModel | None], days: list[date]) -> dict[str, Any]:
    """Out-of-sample coverage of the nominal P10 to P90 band (target 80%)."""
    per_day: list[dict[str, Any]] = []
    inside_all = below_all = above_all = n_all = 0
    bucket_counts = np.zeros((3, 4), dtype=int)  # n, inside, below, above
    for day in days:
        model = models.get(day)
        sub = errtab[errtab["delivery_day"] == day]
        if model is None or sub.empty:
            per_day.append({"delivery_day": day, "n": len(sub), "coverage": None, "below": None, "above": None})
            continue
        fc = sub["forecast"].reset_index(drop=True)
        act = sub["actual"].to_numpy(dtype=float)
        band = band_for(model, fc)
        below = act < band["band_low"].to_numpy()
        above = act > band["band_high"].to_numpy()
        inside = ~(below | above)
        n = len(sub)
        per_day.append(
            {
                "delivery_day": day,
                "n": n,
                "coverage": float(inside.mean()),
                "below": float(below.mean()),
                "above": float(above.mean()),
            }
        )
        inside_all += int(inside.sum())
        below_all += int(below.sum())
        above_all += int(above.sum())
        n_all += n
        for b in range(3):
            m = band["bucket"].to_numpy() == b
            bucket_counts[b] += [int(m.sum()), int((inside & m).sum()), int((below & m).sum()), int((above & m).sum())]
    by_bucket = []
    for b, label in enumerate(["low forecast", "mid forecast", "high forecast"]):
        n, ins, bel, abv = bucket_counts[b]
        if n:
            by_bucket.append({"bucket": label, "n": int(n), "coverage": ins / n, "below": bel / n, "above": abv / n})
    scored = [d for d in per_day if d["coverage"] is not None]
    return {
        "nominal": 0.8,
        "n": n_all,
        "coverage": inside_all / n_all if n_all else None,
        "below": below_all / n_all if n_all else None,
        "above": above_all / n_all if n_all else None,
        "days_scored": len(scored),
        "days_without_band": len(per_day) - len(scored),
        "by_bucket": by_bucket,
        "per_day": per_day,
        "worst_days": sorted(scored, key=lambda d: float(d["coverage"]))[:5],
    }


def cover_backtest(errtab: pd.DataFrame, models: dict[date, BandModel | None], days: list[date], ratio: float) -> dict:
    """What the cover rule would have done, out of sample. MWh = MW x 0.5 h per half-hour."""
    n = short = 0
    bought = unused = shortfall = 0.0
    for day in days:
        model = models.get(day)
        sub = errtab[errtab["delivery_day"] == day]
        if model is None or sub.empty:
            continue
        fc = sub["forecast"].reset_index(drop=True)
        err = sub["error"].to_numpy(dtype=float)
        cover = cover_for_ratio(model, fc, ratio)
        need = np.maximum(err, 0.0)
        n += len(sub)
        short += int((err > cover).sum())
        bought += float(cover.sum()) * 0.5
        unused += float(np.maximum(cover - need, 0.0).sum()) * 0.5
        shortfall += float(np.maximum(need - cover, 0.0).sum()) * 0.5
    return {
        "ratio": ratio,
        "target_quantile": ratio / (1 + ratio),
        "n": n,
        "share_short": short / n if n else None,
        "extra_mwh_bought": bought,
        "extra_mwh_unused": unused,
        "remaining_shortfall_mwh": shortfall,
    }
