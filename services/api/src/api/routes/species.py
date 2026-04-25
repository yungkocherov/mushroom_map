"""
Species endpoints.

    GET /api/species/
        Полный справочник — плоский список для каталога /species.
        Топ-3 forest_types включены в карточку для превью.

    GET /api/species/search?q=белый&limit=10
        Substring-поиск по name_ru (ILIKE %q%). Используется search-bar'ом.

    GET /api/species/{slug}
        Детали одного вида — полный набор полей + affinity по лесам +
        similars/cooking из meta JSONB. 404 если slug не найден.

Порядок путей в FastAPI важен: `/search` и `/` должны идти до
`/{slug}`, иначе slug'ом будет трактоваться даже "search".
"""

from fastapi import APIRouter, HTTPException, Query

from api.db import get_conn

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def _fetch_top_forest_types(conn, species_id: int, limit: int = 3) -> list[str]:
    rows = conn.execute(
        """
        SELECT forest_type
        FROM species_forest_affinity
        WHERE species_id = %s
        GROUP BY forest_type
        ORDER BY MAX(affinity) DESC
        LIMIT %s
        """,
        (species_id, limit),
    ).fetchall()
    return [r[0] for r in rows]


# ──────────────────────────────────────────────────────────────────────
# Full catalog: GET /api/species/
# ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_species() -> list[dict]:
    """Все виды из справочника. Одним запросом — вывод сортируется
    по name_ru. Top-3 forest_types дёргается вторым запросом, ибо
    LATERAL/JSON-агрегация ради 25 строк избыточна."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, slug, name_ru, name_lat, edibility, season_months,
                   photo_url, red_book
            FROM species
            ORDER BY name_ru
            """
        ).fetchall()

        result = []
        for row in rows:
            species_id, slug, name_ru, name_lat, edibility, season_months, photo_url, red_book = row
            result.append({
                "slug":          slug,
                "name_ru":       name_ru,
                "name_lat":      name_lat,
                "edibility":     edibility,
                "season_months": season_months or [],
                "photo_url":     photo_url,
                "red_book":      red_book,
                "forest_types":  _fetch_top_forest_types(conn, species_id, 3),
            })
    return result


# ──────────────────────────────────────────────────────────────────────
# Search: GET /api/species/search
# ──────────────────────────────────────────────────────────────────────

@router.get("/search")
def search_species(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=20),
) -> list[dict]:
    """Search species by Russian name (case-insensitive substring match)."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.slug, s.name_ru, s.name_lat, s.edibility, s.season_months
            FROM species s
            WHERE s.name_ru ILIKE %s
            ORDER BY s.name_ru
            LIMIT %s
            """,
            (f"%{q}%", limit),
        ).fetchall()

        result = []
        for row in rows:
            species_id, slug, name_ru, name_lat, edibility, season_months = row
            result.append({
                "slug":          slug,
                "name_ru":       name_ru,
                "name_lat":      name_lat,
                "edibility":     edibility,
                "season_months": season_months,
                "forest_types":  _fetch_top_forest_types(conn, species_id, 5),
            })
    return result


# ──────────────────────────────────────────────────────────────────────
# Detail: GET /api/species/{slug}
# ──────────────────────────────────────────────────────────────────────

@router.get("/{slug}")
def species_detail(slug: str) -> dict:
    """Полный набор данных для страницы вида.

    similars и cooking читаются из `meta` JSONB — это позволяет
    наполнять справочник без миграций схемы. Формат:
        meta.similars = [{"slug": "...", "note": "..."}]
        meta.cooking  = "свободный markdown-подобный текст"
    Отсутствие полей в meta -> пустой массив / null в ответе.
    """
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, slug, name_ru, name_lat, synonyms, genus, family,
                   edibility, season_months, description, photo_url, wiki_url,
                   red_book, meta
            FROM species
            WHERE slug = %s
            """,
            (slug,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Species '{slug}' not found")

        (sid, slug, name_ru, name_lat, synonyms, genus, family,
         edibility, season_months, description, photo_url, wiki_url,
         red_book, meta) = row

        forest_rows = conn.execute(
            """
            SELECT forest_type, affinity, note
            FROM species_forest_affinity
            WHERE species_id = %s
            ORDER BY affinity DESC
            """,
            (sid,),
        ).fetchall()

    forests = [
        {"forest_type": r[0], "affinity": float(r[1]), "note": r[2]}
        for r in forest_rows
    ]

    # Нормализация meta — защищаемся от мусора из миграций/ручного ввода.
    meta_obj = meta if isinstance(meta, dict) else {}

    similars_raw = meta_obj.get("similars", [])
    similars: list[dict] = []
    if isinstance(similars_raw, list):
        for item in similars_raw:
            if isinstance(item, dict) and isinstance(item.get("slug"), str):
                similars.append({
                    "slug": item["slug"],
                    "note": str(item.get("note", "")),
                })

    cooking = meta_obj.get("cooking")
    if not isinstance(cooking, str):
        cooking = None

    return {
        "slug":           slug,
        "name_ru":        name_ru,
        "name_lat":       name_lat,
        "synonyms":       synonyms or [],
        "genus":          genus,
        "family":         family,
        "edibility":      edibility,
        "season_months":  season_months or [],
        "description":    description,
        "photo_url":      photo_url,
        "wiki_url":       wiki_url,
        "red_book":       red_book,
        "forests":        forests,
        "similars":       similars,
        "cooking":        cooking,
    }


# Бывший legacy `/api/species/{slug}/forests` удалён 2026-04-25 —
# всё это покрывается /api/species/{slug} (поле `forests`).
