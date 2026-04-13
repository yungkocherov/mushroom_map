"""
Газеттир: справочник топонимов региона.

Содержит:
    - normalize_name(name)              — каноническая нормализация для матчинга
    - GazetteerEntry                    — дата-класс одного топонима
    - fetch_osm_places(bbox)            — Overpass-запрос place/natural/tourism
    - fetch_osm_admin_areas(bbox, ...)  — Overpass-запрос boundary=administrative
    - upsert_gazetteer(conn, region_id, entries)
    - upsert_admin_areas(conn, region_id, areas)

Используется пайплайном pipelines/load_gazetteer.py.
"""

from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable

import httpx
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import unary_union


OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

PLACE_KIND_MAP: dict[str, str] = {
    "city": "settlement",
    "town": "settlement",
    "village": "settlement",
    "hamlet": "settlement",
    "suburb": "settlement",
    "neighbourhood": "settlement",
    "isolated_dwelling": "settlement",
    "farm": "settlement",
    "locality": "tract",
    "island": "tract",
}

NATURAL_KIND_MAP: dict[str, str] = {
    "peak": "tract",
    "water": "lake",
    "wood": "tract",
}

WATERWAY_KINDS: set[str] = {"river", "stream", "canal"}

SETTLEMENT_POPULARITY = {
    "city": 10_000,
    "town": 3_000,
    "village": 500,
    "suburb": 300,
    "hamlet": 100,
    "isolated_dwelling": 20,
    "farm": 20,
    "locality": 10,
    "neighbourhood": 50,
    "island": 30,
}


# ─── Normalization ────────────────────────────────────────────────────────────

_QUOTES_RE = re.compile(r'[«»"\'`]')
_EXTRA_WS_RE = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Каноническая нормализация для матчинга.

    Пример: "оз. Лемболовское" -> "оз лемболовское"
    """
    s = (name or "").strip().lower()
    s = unicodedata.normalize("NFKC", s)
    # убираем комбинирующие знаки (ударения)
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))
    s = _QUOTES_RE.sub("", s)
    s = s.replace(".", " ").replace(",", " ")
    s = _EXTRA_WS_RE.sub(" ", s).strip()
    return s


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class GazetteerEntry:
    name_ru: str
    name_normalized: str
    aliases: list[str]
    kind: str                  # settlement|tract|lake|river|district|station|poi
    lat: float
    lon: float
    source: str = "osm"        # "osm" | "manual" | "wikidata"
    popularity: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class AdminArea:
    code: str                  # OSM relation id как строка
    level: int                 # 4 / 6 / 8
    name_ru: str
    geometry: MultiPolygon
    meta: dict[str, Any] = field(default_factory=dict)


# ─── Overpass HTTP ────────────────────────────────────────────────────────────

def _overpass_request(query: str, *, timeout_s: int = 600, max_retries: int = 3) -> dict:
    last_err: Exception | None = None
    for attempt in range(max_retries):
        mirror = OVERPASS_MIRRORS[attempt % len(OVERPASS_MIRRORS)]
        try:
            print(f"  Overpass [{mirror}] попытка {attempt + 1}...")
            with httpx.Client(timeout=timeout_s) as client:
                resp = client.post(mirror, data={"data": query})
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (429, 503, 504):
                wait = 10 * (attempt + 1)
                print(f"  HTTP {resp.status_code} — ждём {wait}с...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            print(f"  Сетевая ошибка: {e}")
            time.sleep(10)
    raise RuntimeError(f"Overpass: {max_retries} попыток провалились ({last_err})")


# ─── Places (gazetteer entries) ───────────────────────────────────────────────

def _build_places_query(bbox: tuple[float, float, float, float]) -> str:
    """bbox = (south, west, north, east)."""
    s, w, n, e = bbox
    box = f"{s},{w},{n},{e}"
    return (
        f"[out:json][timeout:300];\n"
        f"(\n"
        f'  node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|'
        f'isolated_dwelling|farm|locality|island)$"]["name"]({box});\n'
        f'  node["natural"="peak"]["name"]({box});\n'
        f'  node["railway"="station"]["name"]({box});\n'
        f'  way["natural"="water"]["name"]({box});\n'
        f'  relation["natural"="water"]["name"]({box});\n'
        f'  way["waterway"~"^(river|canal)$"]["name"]({box});\n'
        f'  relation["waterway"~"^(river|canal)$"]["name"]({box});\n'
        f");\n"
        f"out center tags;\n"
    )


def _aliases_from_tags(tags: dict[str, str]) -> list[str]:
    names: list[str] = []
    for key in ("alt_name", "old_name", "name:ru", "official_name", "loc_name"):
        v = tags.get(key)
        if v:
            for part in v.split(";"):
                part = part.strip()
                if part:
                    names.append(part)
    # short_name тоже полезен
    if (short := tags.get("short_name")):
        names.append(short.strip())
    return names


def _entry_kind(tags: dict[str, str]) -> str | None:
    if (place := tags.get("place")):
        return PLACE_KIND_MAP.get(place)
    if tags.get("natural") == "peak":
        return "tract"
    if tags.get("natural") == "water":
        return "lake"
    if (waterway := tags.get("waterway")) in WATERWAY_KINDS:
        return "river"
    if tags.get("railway") == "station":
        return "station"
    return None


def _entry_popularity(tags: dict[str, str]) -> int:
    place = tags.get("place", "")
    base = SETTLEMENT_POPULARITY.get(place, 0)
    try:
        pop = int(tags.get("population", "0").replace(" ", ""))
    except (ValueError, AttributeError):
        pop = 0
    return max(base, pop)


def fetch_osm_places(
    bbox: tuple[float, float, float, float],
    *,
    timeout_s: int = 600,
) -> list[GazetteerEntry]:
    """Скачивает топонимы через Overpass и нормализует их в GazetteerEntry."""
    query = _build_places_query(bbox)
    data = _overpass_request(query, timeout_s=timeout_s)
    elements: list[dict] = data.get("elements", [])
    print(f"  OSM places: получено {len(elements)} элементов")

    out: list[GazetteerEntry] = []
    seen: set[tuple[str, str, float, float]] = set()

    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        kind = _entry_kind(tags)
        if not kind:
            continue

        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            center = el.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue

        key = (name.lower(), kind, round(lat, 4), round(lon, 4))
        if key in seen:
            continue
        seen.add(key)

        out.append(
            GazetteerEntry(
                name_ru=name,
                name_normalized=normalize_name(name),
                aliases=_aliases_from_tags(tags),
                kind=kind,
                lat=float(lat),
                lon=float(lon),
                source="osm",
                popularity=_entry_popularity(tags),
                meta={
                    "osm_type": el["type"],
                    "osm_id": el["id"],
                    "tags": {k: v for k, v in tags.items() if len(v) < 200},
                },
            )
        )
    print(f"  OSM places: нормализовано {len(out)} записей")
    return out


# ─── Admin areas ──────────────────────────────────────────────────────────────

def _build_admin_query(
    bbox: tuple[float, float, float, float],
    levels: Iterable[int],
) -> str:
    s, w, n, e = bbox
    box = f"{s},{w},{n},{e}"
    levels_re = "|".join(str(lv) for lv in levels)
    return (
        f"[out:json][timeout:600];\n"
        f'relation["boundary"="administrative"]["admin_level"~"^({levels_re})$"]'
        f'["name"]({box});\n'
        f"out geom;\n"
    )


def _relation_to_multipolygon(el: dict) -> MultiPolygon | None:
    """Собирает MultiPolygon из relation с out geom (members имеют geometry)."""
    outer_rings: list[list[tuple[float, float]]] = []
    inner_rings: list[list[tuple[float, float]]] = []

    # Сначала склеим куски way-членов в замкнутые кольца.
    pieces: dict[str, list[list[tuple[float, float]]]] = {"outer": [], "inner": []}
    for m in el.get("members", []):
        if m.get("type") != "way":
            continue
        role = m.get("role") or "outer"
        if role not in pieces:
            role = "outer"
        geom = m.get("geometry") or []
        coords = [(p["lon"], p["lat"]) for p in geom if "lat" in p and "lon" in p]
        if len(coords) >= 2:
            pieces[role].append(coords)

    def _stitch(segments: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
        rings: list[list[tuple[float, float]]] = []
        remaining = [list(s) for s in segments]
        while remaining:
            current = remaining.pop(0)
            changed = True
            while changed and current[0] != current[-1]:
                changed = False
                for i, seg in enumerate(remaining):
                    if seg[0] == current[-1]:
                        current.extend(seg[1:])
                        remaining.pop(i)
                        changed = True
                        break
                    if seg[-1] == current[-1]:
                        current.extend(reversed(seg[:-1]))
                        remaining.pop(i)
                        changed = True
                        break
                    if seg[-1] == current[0]:
                        current = list(seg) + current[1:]
                        remaining.pop(i)
                        changed = True
                        break
                    if seg[0] == current[0]:
                        current = list(reversed(seg))[:-1] + current
                        remaining.pop(i)
                        changed = True
                        break
            if current[0] == current[-1] and len(current) >= 4:
                rings.append(current)
        return rings

    outer_rings = _stitch(pieces["outer"])
    inner_rings = _stitch(pieces["inner"])

    if not outer_rings:
        return None

    polygons: list[Polygon] = []
    for ring in outer_rings:
        try:
            poly = Polygon(ring, holes=[r for r in inner_rings if Polygon(ring).contains(Polygon(r))])
            if poly.is_valid and not poly.is_empty:
                polygons.append(poly)
            else:
                fixed = poly.buffer(0)
                if fixed.is_valid and not fixed.is_empty:
                    if isinstance(fixed, MultiPolygon):
                        polygons.extend(fixed.geoms)
                    elif isinstance(fixed, Polygon):
                        polygons.append(fixed)
        except Exception:
            continue

    if not polygons:
        return None

    merged = unary_union(polygons)
    if isinstance(merged, Polygon):
        return MultiPolygon([merged])
    if isinstance(merged, MultiPolygon):
        return merged
    return None


def fetch_osm_admin_areas(
    bbox: tuple[float, float, float, float],
    *,
    levels: Iterable[int] = (6, 8),
    timeout_s: int = 600,
) -> list[AdminArea]:
    """Качает boundary=administrative в bbox для указанных admin_level."""
    levels = list(levels)
    query = _build_admin_query(bbox, levels)
    data = _overpass_request(query, timeout_s=timeout_s)
    elements: list[dict] = data.get("elements", [])
    print(f"  OSM admin_area: получено {len(elements)} relations")

    out: list[AdminArea] = []
    for el in elements:
        if el["type"] != "relation":
            continue
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        try:
            level = int(tags.get("admin_level", "0"))
        except ValueError:
            continue
        if level not in levels:
            continue
        geom = _relation_to_multipolygon(el)
        if geom is None or geom.is_empty:
            continue
        out.append(
            AdminArea(
                code=f"relation/{el['id']}",
                level=level,
                name_ru=name,
                geometry=geom,
                meta={
                    "osm_id": el["id"],
                    "tags": {k: v for k, v in tags.items() if len(v) < 200},
                },
            )
        )
    print(f"  OSM admin_area: нормализовано {len(out)} записей")
    return out


# ─── DB upsert ────────────────────────────────────────────────────────────────

def upsert_admin_areas(conn, region_id: int, areas: list[AdminArea]) -> int:
    """Вставляет/обновляет admin_area по (region_id, code)."""
    n = 0
    with conn.transaction():
        for a in areas:
            conn.execute(
                """
                INSERT INTO admin_area (region_id, code, level, name_ru, geometry, meta)
                VALUES (
                    %s, %s, %s, %s,
                    ST_Multi(ST_GeomFromText(%s, 4326)),
                    %s::jsonb
                )
                ON CONFLICT (region_id, code) DO UPDATE SET
                    level    = EXCLUDED.level,
                    name_ru  = EXCLUDED.name_ru,
                    geometry = EXCLUDED.geometry,
                    meta     = EXCLUDED.meta
                """,
                (region_id, a.code, a.level, a.name_ru, a.geometry.wkt, _json(a.meta)),
            )
            n += 1
    return n


def upsert_gazetteer(
    conn,
    region_id: int,
    entries: list[GazetteerEntry],
    *,
    link_admin_area: bool = True,
) -> int:
    """Вставляет/обновляет gazetteer_entry.

    Уникальность — по (region_id, name_normalized, kind, round(lat,4), round(lon,4)),
    но в схеме нет такого уникального индекса, поэтому сначала чистим старые osm-записи
    региона и вставляем заново (идемпотентно в рамках одного прогона).
    """
    n = 0
    with conn.transaction():
        # полная перезапись osm-слоя для региона — manual/wikidata не трогаем
        conn.execute(
            "DELETE FROM gazetteer_entry WHERE region_id = %s AND source = 'osm'",
            (region_id,),
        )
        for e in entries:
            admin_sql = (
                "(SELECT id FROM admin_area "
                " WHERE region_id = %s "
                "   AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(%s, %s), 4326)) "
                " ORDER BY level DESC LIMIT 1)"
                if link_admin_area
                else "NULL"
            )
            params: tuple
            if link_admin_area:
                params = (
                    region_id,
                    e.name_ru,
                    e.name_normalized,
                    e.aliases,
                    e.kind,
                    region_id, e.lon, e.lat,    # admin_area subquery
                    e.lon, e.lat,                # point
                    e.popularity,
                    e.source,
                    _json(e.meta),
                )
            else:
                params = (
                    region_id,
                    e.name_ru,
                    e.name_normalized,
                    e.aliases,
                    e.kind,
                    e.lon, e.lat,
                    e.popularity,
                    e.source,
                    _json(e.meta),
                )
            conn.execute(
                f"""
                INSERT INTO gazetteer_entry (
                    region_id, name_ru, name_normalized, aliases, kind,
                    admin_area_id, point, popularity, source, meta
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    {admin_sql},
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                    %s, %s, %s::jsonb
                )
                """,
                params,
            )
            n += 1
    return n


def _json(obj: Any) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, default=str)
