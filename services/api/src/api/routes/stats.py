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

Оба endpoint'а дёшевы по чтению — простые агрегаты на уже-проиндексированных
таблицах. Short-cache (5 min) — в реверс-прокси или через Cache-Control
впоследствии.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.db import get_conn

router = APIRouter()


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
@router.get("/overview")
def overview() -> dict:
    """Сводка по корпусу и доступным данным."""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM vk_post)                                      AS posts_total,
                (SELECT COUNT(*) FROM vk_post WHERE photo_species IS NOT NULL)       AS posts_classified,
                (SELECT COUNT(*) FROM species)                                       AS species_count,
                (SELECT COUNT(*) FROM admin_area WHERE level = 6)                    AS district_count,
                (SELECT COUNT(*) FROM forest_unified)                                AS forest_polygon_count,
                (SELECT MAX(fetched_at) FROM vk_post)                                AS last_vk_refresh,
                (SELECT photo_prompt_version FROM vk_post
                   WHERE photo_prompt_version IS NOT NULL
                   ORDER BY photo_processed_at DESC NULLS LAST
                   LIMIT 1)                                                          AS last_prompt_version
            """
        ).fetchone()

    posts_total, posts_classified, species_count, district_count, forest_count, last_vk, prompt_ver = row
    return {
        "posts_total":          int(posts_total or 0),
        "posts_classified":     int(posts_classified or 0),
        "species_count":        int(species_count or 0),
        "district_count":       int(district_count or 0),
        "forest_polygon_count": int(forest_count or 0),
        "last_vk_refresh":      last_vk.isoformat() if last_vk else None,
        "photo_prompt_version": prompt_ver,
        # Прогноз-модель пока не подключена — наполним когда появится
        # `/api/forecast/at` (Phase 3).
        "forecast_model_version": None,
        "forecast_cv_r2":         None,
    }


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
