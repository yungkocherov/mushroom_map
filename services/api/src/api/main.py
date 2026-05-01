"""FastAPI entry point for mushroom-map."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.db import close_pool, get_conn, init_pool
from api.settings import settings
from api.routes import (
    forest, species, regions, soil, water, terrain, districts, stats,
    auth, user, cabinet, forecast, places, mobile,
)


# Sentry / GlitchTip init. Безопасный no-op если DSN не задан или
# sentry-sdk не установлен (например, dev-контейнер до rebuild'а
# образа). sentry-sdk[fastapi] авто-инструментирует ASGI middleware
# если init вызван ДО создания FastAPI().
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            release=settings.git_sha,
            environment=settings.sentry_environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            # request body может содержать координаты сохранённых spot'ов
            # — это персональные данные с точки зрения 152-ФЗ.
            send_default_pii=False,
        )
    except ImportError:
        # sentry-sdk не в образе — продолжаем без observability,
        # фронт-стек продолжит работать.
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    yield
    close_pool()


app = FastAPI(
    title="mushroom-map API",
    version="0.1.0",
    description="Backend for the mushroom-map interactive service.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forest.router, prefix="/api/forest", tags=["forest"])
app.include_router(soil.router,    prefix="/api/soil",    tags=["soil"])
app.include_router(water.router,   prefix="/api/water",   tags=["water"])
app.include_router(terrain.router, prefix="/api/terrain", tags=["terrain"])
app.include_router(species.router, prefix="/api/species", tags=["species"])
app.include_router(regions.router, prefix="/api/regions", tags=["regions"])
app.include_router(districts.router, prefix="/api/districts", tags=["districts"])
app.include_router(forecast.router, prefix="/api/forecast", tags=["forecast"])
app.include_router(places.router,   prefix="/api/places",   tags=["places"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(auth.router,  prefix="/api/auth",  tags=["auth"])
app.include_router(user.router,    prefix="/api/user",    tags=["user"])
app.include_router(cabinet.router, prefix="/api/cabinet", tags=["cabinet"])
app.include_router(mobile.router,  prefix="/api/mobile",  tags=["mobile"])

# Статические PMTiles файлы — раздача с поддержкой Range-requests через
# StaticFiles. Динамический /tiles/{z}/{x}/{y}.mvt был дроплен (мёртвый
# код, фронт всегда читает PMTiles range'ами).
_tiles_dir = Path(settings.tiles_dir)
_tiles_dir.mkdir(parents=True, exist_ok=True)
app.mount("/tiles", StaticFiles(directory=str(_tiles_dir)), name="static-tiles")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/healthz")
def healthz() -> dict[str, str]:
    # Liveness + readiness в одном эндпоинте: пингуем pool. Если БД мертва,
    # возвращаем 503 — внешний мониторинг (uptimerobot/healthchecks.io)
    # триггерит alert.
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail=f"db unreachable: {exc}")
    return {"status": "ok", "db": "ok"}
