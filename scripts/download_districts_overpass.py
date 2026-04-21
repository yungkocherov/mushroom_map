"""
Скачивает административные районы (admin_level=6) Ленобласти через Overpass API.

admin_level=6 в OSM RU = муниципальный район / городской округ. Для ЛО это
~17 районов + несколько городских округов (Сосновый Бор и т.д.). Запрос идёт
по bbox ЛО, поэтому в ответ попадают также районы соседних субъектов
(Карелия, Новгородская, Псковская, Вологодская обл.) — их отфильтрует ingest
по пересечению с region.geometry Ленобласти.

Используется для прогноза плодоношения: район × день × группа — минимальная
гранулярность, которую можно достать из текста VK-постов.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union

# Запрашиваем через area (быстрее — сервер сам режет по границе ЛО).
# bbox-запрос падал в 504 из-за тяжёлых relations на всей области.
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

QUERY = """[out:json][timeout:300];
relation["boundary"="administrative"]["admin_level"="4"]["name"="Ленинградская область"];
map_to_area->.lo;
(
  relation["boundary"="administrative"]["admin_level"="6"](area.lo);
);
out geom;
"""


def relation_to_geom(rel: dict) -> dict | None:
    """OSM boundary relation → MultiPolygon через shapely.polygonize.

    В OSM outer-members — это сегменты way'ев, а не замкнутые кольца.
    Нужно склеить их по совпадающим концам, чтобы получить большие полигоны
    районов. polygonize умеет это делать из набора LineString'ов.

    inner-members (дырки-анклавы типа городов внутри района) пока игнорируем —
    для наших задач (группировка постов / агрегация фич по району) завышение
    площади на пару процентов приемлемо.
    """
    outer_lines = []
    for m in rel.get("members") or []:
        if m.get("role") != "outer":
            continue
        coords = [(p["lon"], p["lat"]) for p in (m.get("geometry") or []) if p]
        if len(coords) >= 2:
            outer_lines.append(LineString(coords))
    if not outer_lines:
        return None

    # unary_union объединяет сегменты (дедупит общие), polygonize замыкает их
    # в полигоны. Работает даже когда relation разбит на много ways.
    merged = unary_union(outer_lines)
    polys = list(polygonize(merged))
    if not polys:
        return None

    geoms = [poly for poly in polys if poly.is_valid and not poly.is_empty]
    if not geoms:
        return None

    if len(geoms) == 1:
        return mapping(geoms[0])
    # несколько полигонов = MultiPolygon (район может быть с эксклавами)
    return {
        "type": "MultiPolygon",
        "coordinates": [mapping(p)["coordinates"] for p in geoms],
    }


def fetch(endpoint: str) -> dict:
    req = urllib.request.Request(
        endpoint,
        data=QUERY.encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "mushroom-map/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=700) as resp:
        return json.loads(resp.read())


def main() -> None:
    data = None
    for ep in ENDPOINTS:
        print(f"Querying {ep}")
        t0 = time.time()
        try:
            data = fetch(ep)
            print(f"  OK in {time.time() - t0:.1f}s")
            break
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}")
            continue
    if data is None:
        sys.exit("All Overpass endpoints failed")

    elems = data.get("elements") or []
    print(f"elements (all level=6 in bbox): {len(elems)}")

    features = []
    for el in elems:
        if el.get("type") != "relation":
            continue
        tags = el.get("tags") or {}
        name_ru = tags.get("name:ru") or tags.get("name") or ""
        if not name_ru:
            continue
        geom = relation_to_geom(el)
        if not geom:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "osm_rel_id": el.get("id"),
                "name_ru": name_ru,
                "name_en": tags.get("name:en") or "",
                "admin_level": tags.get("admin_level"),
                "place": tags.get("place") or "",
                "is_in": tags.get("is_in") or "",
                "ref": tags.get("ref") or "",
                "wikidata": tags.get("wikidata") or "",
            },
            "geometry": geom,
        })

    os.makedirs("data/osm", exist_ok=True)
    out_path = "data/osm/admin_districts_lenoblast.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": features},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"saved: {out_path} ({len(features)} features, {size_mb:.2f} MB)")
    print("next: python pipelines/ingest_districts.py --region lenoblast")


if __name__ == "__main__":
    main()
