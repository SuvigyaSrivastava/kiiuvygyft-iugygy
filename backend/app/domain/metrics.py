"""Accuracy metrics. Sign convention everywhere: error = forecast - actual (MW); positive is over-forecast."""

from typing import Any

import numpy as np
import pandas as pd

from .timeutil import london_hour

HORIZON_EDGES = [0, 12, 18, 24, 30, 36, 42, 1000]
HORIZON_LABELS = ["<12 h", "12-18 h", "18-24 h", "24-30 h", "30-36 h", "36-42 h", "42+ h"]


def add_error(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["error"] = out["forecast"] - out["actual"]
    return out


def summarize(df: pd.DataFrame) -> dict[str, float | int | None]:
    """Headline metrics for rows that have forecast, actual and error."""
    n = len(df)
    if n == 0:
        return {
            "n": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "wape": None,
            "p50_abs": None,
            "p90_abs": None,
            "p95_abs": None,
            "mean_actual": None,
        }
    err = df["error"].to_numpy(dtype=float)
    absr = np.abs(err)
    total_actual = float(df["actual"].sum())
    return {
        "n": n,
        "mae": float(absr.mean()),
        "rmse": float(np.sqrt((err**2).mean())),
        "bias": float(err.mean()),
        "wape": float(absr.sum() / total_actual) if total_actual else None,
        "p50_abs": float(np.quantile(absr, 0.5)),
        "p90_abs": float(np.quantile(absr, 0.9)),
        "p95_abs": float(np.quantile(absr, 0.95)),
        "mean_actual": float(df["actual"].mean()),
    }


def tercile_edges(values: pd.Series | np.ndarray) -> list[float]:
    arr = np.asarray(values, dtype=float)
    return [float(np.quantile(arr, 1 / 3)), float(np.quantile(arr, 2 / 3))]


def level_bucket(values: pd.Series | np.ndarray, edges: list[float]) -> np.ndarray:
    """0 = low, 1 = mid, 2 = high. A value equal to an edge goes to the higher bucket."""
    return np.digitize(np.asarray(values, dtype=float), edges, right=False)


LEVEL_LABELS = ["low forecast", "mid forecast", "high forecast"]


def by_hour(df: pd.DataFrame) -> list[dict[str, Any]]:
    hours = london_hour(df["startTime"]).to_numpy()
    out = []
    for h in range(24):
        sub = df[hours == h]
        if len(sub):
            out.append({"hour": h, **summarize(sub)})
    return out


def by_level(df: pd.DataFrame, edges: list[float]) -> list[dict[str, Any]]:
    bucket = level_bucket(df["forecast"], edges)
    out = []
    for b, label in enumerate(LEVEL_LABELS):
        sub = df[bucket == b]
        if len(sub):
            out.append({"bucket": label, **summarize(sub)})
    return out


def by_horizon(df: pd.DataFrame) -> list[dict[str, Any]]:
    cat = pd.cut(df["horizon_h"], bins=HORIZON_EDGES, labels=HORIZON_LABELS, right=False)
    out = []
    for label in HORIZON_LABELS:
        sub = df[(cat == label).to_numpy()]
        if len(sub):
            out.append({"bucket": label, **summarize(sub)})
    return out


def histogram(errors: pd.Series, bin_mw: float = 500.0) -> list[dict[str, float | int]]:
    arr = errors.to_numpy(dtype=float)
    lo = np.floor(arr.min() / bin_mw) * bin_mw
    hi = np.ceil(arr.max() / bin_mw) * bin_mw + bin_mw
    edges = np.arange(lo, hi + bin_mw, bin_mw)
    counts, _ = np.histogram(arr, bins=edges)
    return [
        {"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))
    ]


def error_vs_lead(all_vintages: pd.DataFrame, bin_h: int = 3, max_h: int = 66) -> list[dict]:
    """Error against lead time using every published vintage. Needs forecast, actual, horizon_h."""
    df = all_vintages[(all_vintages["horizon_h"] >= 0) & (all_vintages["horizon_h"] < max_h)]
    df = add_error(df)
    df = df.assign(bin=(np.floor(df["horizon_h"] / bin_h) * bin_h).astype(int))
    out = []
    for b, sub in df.groupby("bin"):
        s = summarize(sub)
        out.append({"from_h": int(b), "to_h": int(b) + bin_h, **s})
    return out


def worst_days(df: pd.DataFrame, top: int = 5) -> list[dict]:
    g = df.groupby("delivery_day")
    rows = []
    for day, sub in g:
        s = summarize(sub)
        rows.append(
            {
                "delivery_day": day,
                "mae": s["mae"],
                "bias": s["bias"],
                "max_abs_error": float(sub["error"].abs().max()),
                "n": s["n"],
            }
        )
    rows.sort(key=lambda r: r["mae"] or 0, reverse=True)
    return rows[:top]
