"""
Forecast endpoints — «грибная погода» index per district / per point.

    GET /api/forecast/districts?date=YYYY-MM-DD&region=lenoblast
        Choropleth-data: индекс 0..5 для каждого района на дату.
        Используется лендингом (карта-обзор всей ЛО).

    GET /api/forecast/at?lat=&lon=&date=YYYY-MM-DD
        Точечный запрос: индекс для района, в который попадает точка.
        Будущая ML-модель будет уточнять до выдела; сейчас наследует
        district-level value.

**Implementation v1: seeded fixture, NOT a real model.**

Реальная ML-модель живёт в сестринском репо `mushroom-forecast` и пока
не готова. До её приезда мы возвращаем правдоподобные детерминированные
числа: `hash(district_id, date)` → 0..1 → масштабируем до 0..5 с поправками
на широту/долготу района (юг/запад теплее) и на сезон (пик июль-август).

Отвечает поле `confidence: "preview"` — фронт показывает «превью» badge.
Когда ML модель приедет, она заменит источник чисел; контракт ответа
не изменится, только `confidence: "model"`. См. docs/redesign-2026-04.md.

**Контракт `top_species`** — всегда `[{slug, score}]`, не голый массив
строк. Это compat-первое решение: ML-модель будет возвращать вероятности,
и frontend сразу научен их рендерить (бар прозрачности и т.п.).
"""

from __future__ import annotations

import hashlib
import struct
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from api.db import get_conn

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────

# Top-N edible/conditionally-edible species used as candidate pool for
# the «топ-3 видов в районе сегодня» field. Hardcoded here to avoid
# hitting `species_registry` table on every forecast request — these
# slugs are part of the project's frozen vocabulary anyway (see CLAUDE.md
# «Species slug vocabulary is frozen»).
_FORECAST_SPECIES_POOL: tuple[str, ...] = (
    "boletus-edulis",
    "leccinum-aurantiacum",
    "leccinum-versipelle",
    "leccinum-scabrum",
    "imleria-badia",
    "xerocomus-subtomentosus",
    "suillus-luteus",
    "suillus-granulatus",
    "cantharellus-cibarius",
    "craterellus-tubaeformis",
    "lactarius-deliciosus",
    "lactarius-resimus",
    "lactarius-torminosus",
    "russula-vesca",
    "armillaria-mellea",
    "kuehneromyces-mutabilis",
    "morchella-esculenta",
    "macrolepiota-procera",
)

# Acceptable date window for forecast queries. We refuse far past / far
# future dates: past — fixture is not «what was», it's «what would have
# been», better to return 422 and force frontend to show «нет данных»;
# future — model has no skill beyond ~2 weeks, allow 30d as humane buffer.
_DATE_PAST_DAYS = 1
_DATE_FUTURE_DAYS = 30

# Index range — 0 (cold) .. 5 (great day).
_INDEX_MIN = 0.0
_INDEX_MAX = 5.0


# ──────────────────────────────────────────────────────────────────────
# Seeded fixture core — deterministic hash → score
# ──────────────────────────────────────────────────────────────────────

def _hash_to_unit(*parts: Any) -> float:
    """sha256(parts joined by `|`) → first 4 bytes / 0xFFFFFFFF → [0,1)."""
    blob = "|".join(str(p) for p in parts).encode("utf-8")
    digest = hashlib.sha256(blob).digest()
    (n,) = struct.unpack(">I", digest[:4])
    return n / 0xFFFFFFFF


def _seasonal_factor(d: date) -> float:
    """
    Bell-shaped curve over the year. Returns multiplier [0..1.2]:
      Jun-Sep peak (>= 1.0), May/Oct shoulder (~0.6), Nov-Mar near zero.
    Mushroom season is roughly day-of-year 150..280.
    """
    doy = d.timetuple().tm_yday  # 1..366
    # Centered around Aug 5 (doy ≈ 217), σ ≈ 45 days. Outside ±2σ → ~0.
    import math
    sigma = 45.0
    delta = doy - 217
    bell = math.exp(-(delta ** 2) / (2 * sigma * sigma))
    # Clip floor at 0; small bump in spring (morels season) at doy ≈ 130:
    spring = 0.25 * math.exp(-((doy - 130) ** 2) / (2 * 20 * 20))
    return max(0.0, bell + spring)


def _geo_bias(centroid_lat: float, centroid_lon: float) -> float:
    """
    Lenoblast bbox ≈ lat 58.5..61.8, lon 27.8..36.0.
    South & west are warmer → higher index. Returns [-0.4..+0.4].
    """
    # Latitude: 58.5 = +0.4, 61.8 = -0.4. Linear.
    lat_bias = (60.15 - centroid_lat) / 1.65 * 0.4
    # Longitude: 27.8 = +0.3, 36.0 = -0.3. Linear (west warmer).
    lon_bias = (31.9 - centroid_lon) / 4.1 * 0.3
    return max(-0.4, min(0.4, lat_bias)) + max(-0.3, min(0.3, lon_bias))


def _district_index(
    district_id: int, query_date: date, centroid_lat: float, centroid_lon: float
) -> float:
    """
    Deterministic 0..5 index for (district, date). Combines:
      - hash randomness (~ ±1.5)
      - seasonal factor (~ x0..x1.2)
      - geographic bias (~ ±0.7)
    """
    base = _hash_to_unit("idx", district_id, query_date.isoformat())  # 0..1
    season = _seasonal_factor(query_date)
    geo = _geo_bias(centroid_lat, centroid_lon)

    # Map base 0..1 → 1..4 (so even cold months show some variation)
    raw = 1.0 + base * 3.0
    # Apply season as a multiplier on the «above-baseline» part
    # (so winter still has some baseline variance but stays low)
    scaled = raw * season + geo + (1.0 - season) * 0.4
    return max(_INDEX_MIN, min(_INDEX_MAX, round(scaled, 1)))


def _top_species_for(district_id: int, query_date: date, n: int = 3) -> list[dict]:
    """
    Returns `[{slug, score}]` of length `n`, sorted by score desc.
    Score is `hash(district, date, slug)` → 0..1. Deterministic.

    Future ML-model contract: same shape, but score = predicted probability
    that the species is being collected in this district on this date.
    """
    scored = [
        {
            "slug": slug,
            "score": round(_hash_to_unit("sp", district_id, query_date.isoformat(), slug), 3),
        }
        for slug in _FORECAST_SPECIES_POOL
    ]
    scored.sort(key=lambda r: r["score"], reverse=True)
    return scored[:n]


def _district_slug_from_code(code: str | None) -> str | None:
    """
    `admin_area.code` is `osm_rel_{N}`. Spec uses ASCII slug like `luzhsky`
    in URLs (`/map/luzhsky`). For now we just strip `osm_rel_` so the
    endpoint stays self-consistent — phase 2 will introduce a real
    transliterated slug column. See docs/redesign-2026-04.md TODO list.
    """
    if not code:
        return None
    if code.startswith("osm_rel_"):
        return code[len("osm_rel_"):]
    return code


# ──────────────────────────────────────────────────────────────────────
# Query helpers — fetch district list with centroids
# ──────────────────────────────────────────────────────────────────────

def _fetch_districts(region: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT a.id,
                   a.code,
                   a.name_ru,
                   ST_Y(ST_Centroid(a.geometry)) AS lat,
                   ST_X(ST_Centroid(a.geometry)) AS lon
            FROM admin_area a
            JOIN region r ON r.id = a.region_id
            WHERE r.code = %s AND a.level = 6
            ORDER BY a.name_ru
            """,
            (region,),
        ).fetchall()
    return [
        {
            "id": r[0],
            "code": r[1],
            "name_ru": r[2],
            "lat": float(r[3]),
            "lon": float(r[4]),
        }
        for r in rows
    ]


def _district_at_point(lat: float, lon: float, region: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT a.id, a.code, a.name_ru,
                   ST_Y(ST_Centroid(a.geometry)) AS lat,
                   ST_X(ST_Centroid(a.geometry)) AS lon
            FROM admin_area a
            JOIN region r ON r.id = a.region_id
            WHERE r.code = %s
              AND a.level = 6
              AND ST_Intersects(a.geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
            ORDER BY ST_Area(a.geometry) ASC
            LIMIT 1
            """,
            (region, lon, lat),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "code": row[1],
        "name_ru": row[2],
        "lat": float(row[3]),
        "lon": float(row[4]),
    }


# ──────────────────────────────────────────────────────────────────────
# Date validation
# ──────────────────────────────────────────────────────────────────────

def _validate_date(d: date) -> None:
    today = datetime.now(timezone.utc).date()
    earliest = today - timedelta(days=_DATE_PAST_DAYS)
    latest = today + timedelta(days=_DATE_FUTURE_DAYS)
    if d < earliest or d > latest:
        raise HTTPException(
            status_code=422,
            detail=(
                f"date must be in [{earliest.isoformat()}, {latest.isoformat()}]; "
                f"got {d.isoformat()}"
            ),
        )


# ──────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────

@router.get("/districts")
def forecast_districts(
    date_param: date = Query(
        default_factory=lambda: datetime.now(timezone.utc).date(),
        alias="date",
        description="ISO date (YYYY-MM-DD). Default: today.",
    ),
    region: str = Query("lenoblast"),
) -> list[dict]:
    """Choropleth-data: индекс 0..5 для каждого района региона на дату."""
    _validate_date(date_param)
    districts = _fetch_districts(region)
    generated_at = datetime.now(timezone.utc).isoformat()
    return [
        {
            "admin_area_id": d["id"],
            "district_name": d["name_ru"],
            "district_slug": _district_slug_from_code(d["code"]),
            "index": _district_index(d["id"], date_param, d["lat"], d["lon"]),
            "top_species": _top_species_for(d["id"], date_param),
            "confidence": "preview",
            "generated_at": generated_at,
        }
        for d in districts
    ]


@router.get("/at")
def forecast_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    date_param: date = Query(
        default_factory=lambda: datetime.now(timezone.utc).date(),
        alias="date",
    ),
    region: str = Query("lenoblast"),
) -> dict:
    """
    Точечный запрос. Фоллбэк на район, в который попадает точка
    (per-выдел гранулярность придёт с ML-моделью).
    """
    _validate_date(date_param)
    district = _district_at_point(lat, lon, region)
    if district is None:
        raise HTTPException(status_code=404, detail="point is outside any district")

    return {
        "lat": lat,
        "lon": lon,
        "admin_area_id": district["id"],
        "district_name": district["name_ru"],
        "district_slug": _district_slug_from_code(district["code"]),
        "index": _district_index(
            district["id"], date_param, district["lat"], district["lon"]
        ),
        "top_species": _top_species_for(district["id"], date_param),
        "confidence": "preview",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
