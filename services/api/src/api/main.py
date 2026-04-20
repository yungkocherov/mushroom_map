"""FastAPI entry point for mushroom-map."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.db import close_pool, init_pool
from api.settings import settings
from api.routes import forest, species, regions, tiles, soil, water


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
app.include_router(species.router, prefix="/api/species", tags=["species"])
app.include_router(regions.router, prefix="/api/regions", tags=["regions"])
app.include_router(tiles.router, prefix="/tiles", tags=["tiles"])

# Статические PMTiles файлы (range-request support через StaticFiles).
# Роутер выше перехватывает /tiles/forest/{z}/{x}/{y}.mvt;
# всё остальное (в т.ч. /tiles/forest.pmtiles) отдаёт StaticFiles.
_tiles_dir = Path(settings.tiles_dir)
_tiles_dir.mkdir(parents=True, exist_ok=True)
app.mount("/tiles", StaticFiles(directory=str(_tiles_dir)), name="static-tiles")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
