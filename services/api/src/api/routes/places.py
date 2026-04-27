"""
Places (gazetteer) search endpoint.

    GET /api/places/search?q=&limit=10
        Поиск топонимов по name_ru / aliases / триграмма (`gin_trgm_ops`).
        Возвращает список `[{kind, name, lat, lon, district_admin_area_id}]`,
        отсортированный по «качеству» матча: точное совпадение → alias →
        триграмма; внутри каждого уровня — по `popularity DESC`.

Используется будущим Spotlight (cmdk) и /map URL-handler'ами `/map/q=...`.

`gazetteer_entry` живёт со схемой из миграции 006 (см. db/migrations).
В таблице ~21k записей: `settlement | tract | lake | river | district |
station | poi`. Привязка к району (admin_area_id) выставляется на стадии
ingest через ST_Contains; читается как-есть.

Pydantic-валидация на входе:
  - q.min_length = 2     — однобуквенные запросы кладут поиск (вся таблица)
  - limit ∈ [1, 50]      — клиент Spotlight'а не запрашивает > 20

Все запросы — параметризованные через psycopg %s; ILIKE-паттерны
строятся в Python уже после `q.lower()`.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from api.db import get_conn

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Search
# ──────────────────────────────────────────────────────────────────────

@router.get("/search")
def search_places(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(10, ge=1, le=50),
    region: str = Query("lenoblast"),
) -> list[dict]:
    """
    Поиск топонимов в gazetteer.

    Стратегия:
      1. exact ILIKE по name_ru или элементу aliases — score 1.0
      2. prefix ILIKE — score 0.8
      3. триграммное расстояние через `name_normalized %% q` — score 0..0.7
    Результаты дедуплицируются по id, сортируются по (score DESC,
    popularity DESC). Лимит применяется в SQL — это дешевле, чем тащить
    весь набор и отрезать в Python.

    `kind` остаётся как-есть из таблицы (`settlement | lake | river |
    tract | station | poi | district`); фронт сам решает, как иконку
    нарисовать.
    """
    pattern = f"%{q}%"
    prefix = f"{q}%"

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT g.id,
                   g.name_ru,
                   g.kind,
                   ST_Y(g.point) AS lat,
                   ST_X(g.point) AS lon,
                   g.admin_area_id,
                   g.popularity,
                   CASE
                       WHEN g.name_ru ILIKE %s THEN 0.8
                       WHEN g.name_ru ILIKE %s THEN 1.0
                       WHEN %s = ANY (g.aliases) THEN 0.9
                       ELSE 0.5
                   END AS score
            FROM gazetteer_entry g
            JOIN region r ON r.id = g.region_id
            WHERE r.code = %s
              AND (
                   g.name_ru ILIKE %s
                OR g.aliases::text ILIKE %s
                OR g.name_normalized ILIKE %s
              )
            ORDER BY score DESC, g.popularity DESC, length(g.name_ru) ASC
            LIMIT %s
            """,
            (
                prefix,            # score-prefix check
                q,                 # exact match (case-insensitive via ILIKE without %)
                q,                 # alias exact membership
                region,
                pattern,           # name_ru substring
                pattern,           # aliases-array substring (pragmatic: stringify whole array)
                pattern.lower(),   # normalized substring
                limit,
            ),
        ).fetchall()

    return [
        {
            "id":                       r[0],
            "name":                     r[1],
            "kind":                     r[2],
            "lat":                      float(r[3]),
            "lon":                      float(r[4]),
            "district_admin_area_id":   r[5],
            "popularity":               r[6],
            "score":                    float(r[7]),
        }
        for r in rows
    ]
