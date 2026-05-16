"""
Stats / transparency endpoints.

    GET /api/stats/overview
        Общая сводка: посты, виды, районы, лесные полигоны, timestamp
        последнего обновления данных, версия прогноз-модели.
        Используется на landing ("scale bar") и в /data/overview-виджете.

    GET /api/stats/vk/species-now?window=14d
        Топ-видов грибов за последние N дней из VK-классификатора
        (qwen3.5-vl, текущий prompt_version). Отдаёт species_key + human
        label + count + %-share + trend. Используется виджетом «что
        сейчас растёт» на главной.

`/overview` — самый горячий публичный endpoint (загружается на лендинге
каждым новым посетителем). Узкое место: `SUM(area_m2)` по 2.17M полигонов
~7-8 сек. Решение — TTL-кеш в памяти процесса (1 час) + Cache-Control:
public, max-age=300, stale-while-revalidate=86400 для браузеров/CDN.
Первый cold-request после рестарта медленный, всё остальное instant.
Pre-warm при старте поднимает кеш в фоне.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response

from api.db import get_conn

router = APIRouter()
log = logging.getLogger(__name__)

# In-process cache для /overview. dict вместо lru_cache — нужен TTL
# и явный invalidate (pre-warm на startup). Lock защищает от thundering
# herd: несколько одновременных cold-requests НЕ запустят 5 параллельных
# SUM'ов, дождутся первого.
_OVERVIEW_TTL_SECONDS = 3600  # 1 час
_overview_cache: dict[str, object] = {"value": None, "ts": 0.0}
_overview_lock = threading.Lock()


# ──────────────────────────────────────────────────────────────────────────
# Species key → human label mapping
# ──────────────────────────────────────────────────────────────────────────
# Отражает CLASSIFY_SCHEMA из pipelines/ingest_vk.py (v13-birch-strict-...).
# ягоды и «other» сюда входят, чтобы мы могли безопасно сериализовать любой
# ключ; «other» на витрине фильтруем.
SPECIES_LABELS: dict[str, str] = {
    "porcini":         "Белые",
    "pine_bolete":     "Колосовики",
    "aspen_bolete":    "Подосиновики",
    "birch_bolete":    "Подберёзовики",
    "mokhovik":        "Моховики",
    "chanterelle":     "Лисички",
    "saffron_milkcap": "Рыжики",
    "white_milkcap":   "Грузди",
    "woolly_milkcap":  "Волнушки",
    "spring_mushroom": "Сморчки и строчки",
    "honey_fungus":    "Опята",
    "oyster":          "Вёшенки",
    "russula":         "Сыроежки",
    "fly_agaric":      "Мухоморы",
    "blueberry":       "Черника",
    "cloudberry":      "Морошка",
    "cranberry":       "Клюква",
}


# ──────────────────────────────────────────────────────────────────────────
# Overview
# ──────────────────────────────────────────────────────────────────────────
def _compute_overview() -> dict:
    """Тяжёлый SQL, который собирает агрегаты для /overview. SUM(area_m2)
    по 2.17M полигонов держит запрос на ~7 сек — поэтому вызываем строго
    под lock'ом + кешируем результат на _OVERVIEW_TTL_SECONDS."""
    t0 = time.monotonic()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM vk_post)                                      AS posts_total,
                (SELECT COUNT(*) FROM vk_post WHERE photo_species IS NOT NULL)       AS posts_classified,
                (SELECT COUNT(*) FROM species)                                       AS species_count,
                (SELECT COUNT(*) FROM admin_area WHERE level = 6)                    AS district_count,
                (SELECT COUNT(*) FROM forest_unified)                                AS forest_polygon_count,
                (SELECT COALESCE(SUM(area_m2), 0) / 1e6
                   FROM forest_polygon
                   WHERE area_m2 IS NOT NULL)                                        AS forest_area_km2,
                (SELECT MAX(ingested_at) FROM forest_polygon)                        AS forest_last_updated,
                (SELECT MAX(fetched_at) FROM vk_post)                                AS last_vk_refresh,
                (SELECT photo_prompt_version FROM vk_post
                   WHERE photo_prompt_version IS NOT NULL
                   ORDER BY photo_processed_at DESC NULLS LAST
                   LIMIT 1)                                                          AS last_prompt_version
            """
        ).fetchone()

    (posts_total, posts_classified, species_count, district_count,
     forest_count, forest_area_km2, forest_last_updated,
     last_vk, prompt_ver) = row
    payload = {
        "posts_total":          int(posts_total or 0),
        "posts_classified":     int(posts_classified or 0),
        "species_count":        int(species_count or 0),
        "district_count":       int(district_count or 0),
        "forest_polygon_count": int(forest_count or 0),
        "forest_area_km2":      round(float(forest_area_km2 or 0), 1),
        "forest_last_updated":  forest_last_updated.isoformat() if forest_last_updated else None,
        "last_vk_refresh":      last_vk.isoformat() if last_vk else None,
        "photo_prompt_version": prompt_ver,
        # Прогноз-модель пока не подключена — наполним когда появится
        # `/api/forecast/at` (Phase 3).
        "forecast_model_version": None,
        "forecast_cv_r2":         None,
    }
    log.info("stats.overview computed in %.2fs", time.monotonic() - t0)
    return payload


def _get_cached_overview() -> dict:
    """Возвращает закешированный /overview, пересчитывая если TTL истёк."""
    now = time.monotonic()
    cached = _overview_cache.get("value")
    ts = float(_overview_cache.get("ts") or 0)
    if cached is not None and (now - ts) < _OVERVIEW_TTL_SECONDS:
        return cached  # type: ignore[return-value]
    # Cold или stale — берём lock чтобы не запускать 5 параллельных SUM'ов
    # на thundering-herd. Внутри lock'а перепроверяем — другой поток уже
    # мог обновить пока мы ждали.
    with _overview_lock:
        cached = _overview_cache.get("value")
        ts = float(_overview_cache.get("ts") or 0)
        if cached is not None and (now - ts) < _OVERVIEW_TTL_SECONDS:
            return cached  # type: ignore[return-value]
        fresh = _compute_overview()
        _overview_cache["value"] = fresh
        _overview_cache["ts"] = time.monotonic()
        return fresh


def warm_overview_cache() -> None:
    """Вызывается из main.py lifespan startup — прогревает кеш сразу
    после init_pool. Если упадёт (DB ещё не готова) — игнорим, при
    первом реальном запросе пересчитается."""
    try:
        _get_cached_overview()
        log.info("stats.overview cache warmed at startup")
    except Exception as exc:  # noqa: BLE001 — safety net at boot
        log.warning("stats.overview pre-warm failed: %s", exc)


@router.get("/overview")
def overview(response: Response) -> dict:
    """Сводка по корпусу и доступным данным.

    Кешируется in-memory на 1 час. Браузер/CDN кешируют 5 мин с
    stale-while-revalidate 24 ч — следующая страничная навигация в этом
    окне instant даже без сетевого round-trip."""
    data = _get_cached_overview()
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=86400"
    )
    return data


# ──────────────────────────────────────────────────────────────────────────
# VK "species now"
# ──────────────────────────────────────────────────────────────────────────
def _parse_window_days(window: str) -> int:
    """«14d» → 14. Поддержим только дни для простоты."""
    if not window.endswith("d"):
        raise HTTPException(status_code=400, detail="window must end with 'd', e.g. '14d'")
    try:
        days = int(window[:-1])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid window: {window}") from None
    if not 1 <= days <= 365:
        raise HTTPException(status_code=400, detail="window must be between 1d and 365d")
    return days


@router.get("/vk/species-now")
def species_now(
    window: str = Query("14d", description="Длина окна, только дни — «14d», «30d»"),
    limit: int = Query(5, ge=1, le=20),
) -> dict:
    """Топ-видов грибов за последние N дней по VK-постам.

    Внутри: два окна одинаковой длины (текущее и предыдущее). Сравниваем
    counts — получаем trend (up / down / flat). Границы — foray_date,
    иначе fallback на date_ts (MSK).
    """
    days = _parse_window_days(window)
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            WITH windowed AS (
                SELECT
                    COALESCE(
                        foray_date,
                        (date_ts AT TIME ZONE 'Europe/Moscow')::date
                    ) AS d,
                    photo_species
                FROM vk_post
                WHERE photo_species IS NOT NULL
                  AND jsonb_array_length(photo_species) > 0
                  AND COALESCE(
                          foray_date,
                          (date_ts AT TIME ZONE 'Europe/Moscow')::date
                      ) >= (CURRENT_DATE - INTERVAL '{2 * days} days')
            ),
            per_post_species AS (
                SELECT
                    w.d,
                    (s->>'species')::text AS species_key
                FROM windowed w,
                     LATERAL jsonb_array_elements(w.photo_species) s
                WHERE s->>'species' IS NOT NULL
                  AND s->>'species' <> 'other'
            ),
            aggregates AS (
                SELECT
                    species_key,
                    COUNT(*) FILTER (
                        WHERE d >= CURRENT_DATE - INTERVAL '{days} days'
                    ) AS count_current,
                    COUNT(*) FILTER (
                        WHERE d < CURRENT_DATE - INTERVAL '{days} days'
                          AND d >= CURRENT_DATE - INTERVAL '{2 * days} days'
                    ) AS count_previous
                FROM per_post_species
                GROUP BY species_key
            )
            SELECT species_key, count_current, count_previous
            FROM aggregates
            WHERE count_current > 0
            ORDER BY count_current DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()

    total_current = sum(r[1] for r in rows) or 1
    items = []
    for species_key, count_current, count_previous in rows:
        current = int(count_current)
        previous = int(count_previous)
        if previous == 0:
            trend: Optional[str] = "up" if current > 0 else None
        else:
            ratio = current / previous
            if ratio >= 1.2:
                trend = "up"
            elif ratio <= 0.8:
                trend = "down"
            else:
                trend = "flat"
        items.append({
            "species_key": species_key,
            "label":       SPECIES_LABELS.get(species_key, species_key),
            "post_count":  current,
            "pct":         round(100.0 * current / total_current, 1),
            "trend":       trend,
        })

    return {
        "window_days": days,
        "total_posts_in_window": total_current,
        "items": items,
    }


# ──────────────────────────────────────────────────────────────────────────
# Статистика (Phase 1) — читает только public.stats_* (snapshot).
# Пайплайн pipelines/build_stats_snapshot.py наполняет таблицы.
# ──────────────────────────────────────────────────────────────────────────
_STATS_CACHE = "public, max-age=300, stale-while-revalidate=86400"


@router.get("/meta")
def stats_meta(response: Response) -> dict:
    """Свежесть snapshot'а + версии источников. Пустой snapshot → null'ы
    (фронт покажет «данные обновляются»), не 500."""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT generated_at, forest_source_version, vk_prompt_version
            FROM stats_meta WHERE key = 'snapshot'
            """
        ).fetchone()
    response.headers["Cache-Control"] = _STATS_CACHE
    if row is None:
        return {
            "generated_at": None,
            "forest_source_version": None,
            "vk_prompt_version": None,
        }
    return {
        "generated_at": row[0].isoformat() if row[0] else None,
        "forest_source_version": row[1],
        "vk_prompt_version": row[2],
    }


@router.get("/forest")
def stats_forest(
    response: Response,
    dimension: Literal["species", "bonitet", "age_group", "source"] = Query("species"),
) -> dict:
    """Состав леса ЛО по выбранному измерению. Из snapshot — дёшево."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT bucket_key, label, area_km2, polygon_count
            FROM stats_forest
            WHERE dimension = %s
            ORDER BY area_km2 DESC
            """,
            (dimension,),
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    total = sum(float(r[2] or 0) for r in rows) or 1.0
    items = [
        {
            "key": r[0],
            "label": r[1],
            "area_km2": round(float(r[2] or 0), 1),
            "polygon_count": int(r[3] or 0),
            "pct": round(100.0 * float(r[2] or 0) / total, 1),
        }
        for r in rows
    ]
    return {"dimension": dimension, "items": items}


@router.get("/vk/timeline")
def stats_vk_timeline(
    response: Response,
    group: str = Query("all", description="group_key из photo_species или 'all'"),
    limit: int = Query(1500, ge=1, le=5000),
) -> dict:
    """Недельная активность ВК по группам видов. Из snapshot.
    group='all' — все группы; иначе фильтр по одному group_key."""
    with get_conn() as conn:
        if group == "all":
            rows = conn.execute(
                """
                SELECT bucket, group_key, post_count, find_count
                FROM stats_vk_timeline
                ORDER BY bucket ASC, group_key ASC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT bucket, group_key, post_count, find_count
                FROM stats_vk_timeline
                WHERE group_key = %s
                ORDER BY bucket ASC
                LIMIT %s
                """,
                (group, limit),
            ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    items = [
        {
            "bucket": r[0].isoformat() if r[0] else None,
            "group_key": r[1],
            "label": SPECIES_LABELS.get(r[1], r[1]),
            "post_count": int(r[2] or 0),
            "find_count": int(r[3] or 0),
        }
        for r in rows
    ]
    return {"group": group, "items": items}
