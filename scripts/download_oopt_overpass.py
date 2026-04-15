"""
Скачивает ООПТ (boundary=protected_area + leisure=nature_reserve) для
Ленобласти через Overpass API. Сохраняет в GeoJSON с полями, которые читает
ingest_oopt.py:
    - NAME_RU     — name:ru | name
    - KATEGORIA   — грубый маппинг из protect_class/leisure
    - STATUS_FED  — "федеральный" если protection_title/operator содержит это
    - OBJECTID    — stable id (osm_way_<id> / osm_rel_<id>)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

# (south, west, north, east)
BBOX = (58.5, 27.8, 61.8, 33.0)

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

QUERY = f"""[out:json][timeout:600];
(
  way["boundary"="protected_area"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["leisure"="nature_reserve"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["boundary"="protected_area"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["leisure"="nature_reserve"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out geom;
"""


def classify(tags: dict) -> str:
    """Возвращает русскую категорию — её потом маппит _map_category() в ingest_oopt.py."""
    leisure = (tags.get("leisure") or "").lower()
    pc = str(tags.get("protect_class") or "").lower()
    boundary = (tags.get("boundary") or "").lower()
    if leisure == "nature_reserve":
        return "заказник"
    if pc in ("1", "1a", "1b"):
        return "заповедник"
    if pc == "2":
        return "национальный парк"
    if pc == "3":
        return "памятник природы"
    if pc in ("4", "5", "6"):
        return "заказник"
    return boundary or leisure or "other"


def is_federal(tags: dict) -> str:
    for key in ("protection_title", "operator", "operator:type"):
        v = (tags.get(key) or "").lower()
        if "федеральн" in v or "federal" in v:
            return "федеральный"
    return ""


def way_coords(way: dict) -> list:
    return [[p["lon"], p["lat"]] for p in (way.get("geometry") or []) if p]


def close_ring(ring: list) -> list:
    if len(ring) >= 3 and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def relation_to_geom(rel: dict) -> dict | None:
    """Берём только outer-members, строим Polygon или MultiPolygon (без дырок)."""
    outers = []
    for m in rel.get("members") or []:
        if m.get("role") != "outer":
            continue
        ring = [[p["lon"], p["lat"]] for p in (m.get("geometry") or []) if p]
        if len(ring) >= 3:
            outers.append([close_ring(ring)])
    if not outers:
        return None
    if len(outers) == 1:
        return {"type": "Polygon", "coordinates": outers[0]}
    return {"type": "MultiPolygon", "coordinates": outers}


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
    print(f"elements: {len(elems)}")

    features = []
    for el in elems:
        tags = el.get("tags") or {}
        name = tags.get("name:ru") or tags.get("name") or ""
        category = classify(tags)
        federal = is_federal(tags)
        oid = f"osm_{el.get('type')}_{el.get('id')}"

        if el.get("type") == "way":
            ring = way_coords(el)
            if len(ring) < 3:
                continue
            geom = {"type": "Polygon", "coordinates": [close_ring(ring)]}
        elif el.get("type") == "relation":
            geom = relation_to_geom(el)
            if not geom:
                continue
        else:
            continue

        features.append({
            "type": "Feature",
            "properties": {
                "OBJECTID": oid,
                "NAME_RU": name,
                "KATEGORIA": category,
                "STATUS_FED": federal,
            },
            "geometry": geom,
        })

    os.makedirs("data/oopt", exist_ok=True)
    out_path = "data/oopt/oopt_lenoblast.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": features},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"saved: {out_path} ({len(features)} features, {size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
