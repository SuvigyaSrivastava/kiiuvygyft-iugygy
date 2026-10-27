import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, views
from . import models as m
from .data.loader import load_snapshot
from .engine import Engine, Scope, Spec

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


def _engine() -> Engine:
    return Engine(load_snapshot(config.RAW_DIR))


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    app.state.engine = _engine()
    yield


app = FastAPI(
    title="Day-ahead wind forecast portal API",
    description="National GB wind forecasts and actuals from Elexon BMRS, January 2026 snapshot.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def get_engine(request: Request) -> Engine:
    eng = getattr(request.app.state, "engine", None)
    if eng is None:  # serverless runtimes can skip lifespan
        eng = request.app.state.engine = _engine()
    return eng


EngineDep = Annotated[Engine, Depends(get_engine)]


def selection_spec(
    mode: Annotated[Literal["cutoff", "lead"], Query(description="clock cutoff or minimum lead time")] = "cutoff",
    cutoff: Annotated[
        str, Query(pattern=HHMM, description="London time on the decision day, HH:MM")
    ] = config.DEFAULT_CUTOFF,
    lead_hours: Annotated[float, Query(ge=0, le=48)] = 0.0,
    interp: Annotated[Literal["hold", "linear"], Query()] = "hold",
) -> Spec:
    return Spec(mode=mode, cutoff=cutoff, lead_hours=lead_hours, interp=interp)


SpecDep = Annotated[Spec, Depends(selection_spec)]
ScopeQ = Annotated[Scope, Query()]


def check_day(engine: Engine, day: date) -> date:
    if day not in engine.all_days:
        raise HTTPException(404, f"delivery_day must be from {views.day_range(engine)}")
    return day


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(LookupError)
async def lookup_error(_: Request, exc: LookupError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse({"detail": "internal error"}, status_code=500)


@app.get("/api/health", response_model=m.Health)
def health() -> m.Health:
    return m.Health(status="ok")


@app.get("/api/meta", response_model=m.MetaResponse)
def meta(engine: EngineDep) -> m.MetaResponse:
    return views.meta(engine, config.ENABLE_ADMIN_REFRESH)


@app.get("/api/decision", response_model=m.DecisionResponse)
def decision(
    engine: EngineDep,
    spec: SpecDep,
    delivery_day: date,
    ratio: Annotated[float, Query(gt=0, le=100)] = 3.0,
    lag_hours: Annotated[float, Query(ge=0, le=72)] = config.DEFAULT_LAG_HOURS,
    min_history_days: Annotated[int, Query(ge=1, le=60)] = config.DEFAULT_MIN_HISTORY_DAYS,
    include_actual: bool = False,
    hindsight: bool = False,
    flat_demand_mw: Annotated[float | None, Query(gt=0, le=100000)] = None,
) -> m.DecisionResponse:
    check_day(engine, delivery_day)
    return views.decision(
        engine, delivery_day, spec, ratio, lag_hours, min_history_days, include_actual, hindsight, flat_demand_mw
    )


@app.get("/api/month", response_model=m.MonthResponse)
def month(engine: EngineDep, spec: SpecDep, scope: ScopeQ = "decision_in_january") -> m.MonthResponse:
    return views.month(engine, spec, scope)


@app.get("/api/accuracy", response_model=m.AccuracyResponse)
def accuracy(engine: EngineDep, spec: SpecDep, scope: ScopeQ = "decision_in_january") -> m.AccuracyResponse:
    return views.accuracy(engine, spec, scope)


@app.get("/api/sensitivity", response_model=m.SensitivityResponse)
def sensitivity(
    engine: EngineDep,
    cutoffs: Annotated[str, Query(description="comma separated HH:MM list")] = ",".join(config.DEFAULT_CUTOFFS),
    interp: Literal["hold", "linear"] = "hold",
    hindsight_cutoff: Annotated[str, Query(pattern=HHMM)] = config.DEFAULT_CUTOFF,
    scope: ScopeQ = "decision_in_january",
) -> m.SensitivityResponse:
    import re

    items = [c.strip() for c in cutoffs.split(",") if c.strip()]
    if not 1 <= len(items) <= 8 or not all(re.match(HHMM, c) for c in items):
        raise ValueError("cutoffs must be 1 to 8 values like 09:20")
    return views.sensitivity(engine, sorted(set(items)), scope, interp, hindsight_cutoff)


@app.get("/api/quality", response_model=m.QualityResponse)
def quality(engine: EngineDep, spec: SpecDep, scope: ScopeQ = "decision_in_january") -> m.QualityResponse:
    return views.data_quality(engine, spec, scope)


@app.get("/api/calibration", response_model=m.CalibrationResponse)
def calibration(
    engine: EngineDep,
    spec: SpecDep,
    scope: ScopeQ = "decision_in_january",
    lag_hours: Annotated[float, Query(ge=0, le=72)] = config.DEFAULT_LAG_HOURS,
    min_history_days: Annotated[int, Query(ge=1, le=60)] = config.DEFAULT_MIN_HISTORY_DAYS,
    ratio: Annotated[float, Query(gt=0, le=100)] = 3.0,
) -> m.CalibrationResponse:
    return views.calibration(engine, spec, scope, lag_hours, min_history_days, ratio)


@app.get("/api/receipt")
def receipt(engine: EngineDep, spec: SpecDep, delivery_day: date, format: Literal["json", "csv"] = "json") -> Response:
    from .domain.receipt import receipt_to_csv

    check_day(engine, delivery_day)
    rec = engine.build_receipt(delivery_day, spec)
    name = f"receipt_{delivery_day}_{spec.cutoff.replace(':', '') if spec.mode == 'cutoff' else 'lead'}"
    if format == "csv":
        return Response(
            receipt_to_csv(rec),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
        )
    return JSONResponse(rec, headers={"Content-Disposition": f'attachment; filename="{name}.json"'})


@app.post("/api/admin/refresh")
def admin_refresh(request: Request, x_admin_token: Annotated[str | None, Header()] = None) -> dict:
    token = os.environ.get("ADMIN_TOKEN")
    if not config.ENABLE_ADMIN_REFRESH:
        raise HTTPException(404, "not found")
    if not token or x_admin_token != token:
        raise HTTPException(403, "forbidden")
    from .data.elexon_client import build_snapshot

    manifest = build_snapshot(config.RAW_DIR)
    request.app.state.engine = _engine()
    return {"snapshot_id": manifest["snapshot_id"], "fetched_at_utc": manifest["fetched_at_utc"]}


_dist = Path(os.environ.get("FRONTEND_DIST", config.ROOT / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
