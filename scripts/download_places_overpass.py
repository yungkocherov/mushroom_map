"""
download_places_overpass: скачивает все населённые пункты Ленобласти из OSM
через Overpass API и сохраняет как GeoJSON.

Результат: data/tiles/places.geojson
(в tiles/ чтобы API сразу отдавал через /tiles/places.geojson)

Использование:
    python scripts/download_places_overpass.py
    python scripts/download_places_overpass.py --bbox 27.8,58.5,36.0,61.8
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/cgi/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

PLACE_TYPES = "city|town|village|hamlet|suburb|locality|isolated_dwelling|farm"

# Приоритет для сортировки (меньше = важнее, MapLibre symbol-sort-key)
PRIORITY = {"city": 0, "town": 1, "village": 2, "suburb": 3,
            "hamlet": 4, "locality": 5, "farm": 6, "isolated_dwelling": 7}


def fetch(bbox: str) -> list[dict]:
    min_lat, min_lon, max_lat, max_lon = bbox.split(",")
    query = (
        f'[out:json][timeout:120][bbox:{min_lat},{min_lon},{max_lat},{max_lon}];\n'
        f'(node["place"~"^({PLACE_TYPES})$"]["name"];);\n'
        f'out body;'
    )
    for url in MIRRORS:
        try:
            print(f"  trying {url}...")
            req = urllib.request.Request(
                url,
                data=query.encode(),
                method="POST",
                headers={"Content-Type": "text/plain", "User-Agent": "mushroom-map/1.0"},
            )
            resp = urllib.request.urlopen(req, timeout=130)
            data = json.loads(resp.read())
            elements = data.get("elements", [])
            print(f"  ok: {len(elements)} elements from {url}")
            return elements
        except Exception as e:
            print(f"  failed: {e}", file=sys.stderr)
            time.sleep(2)
    raise RuntimeError("all Overpass mirrors failed")


def elements_to_geojson(elements: list[dict]) -> dict:
    features = []
    seen = set()
    for el in elements:
        if el.get("type") != "node":
            continue
        osm_id = el.get("id")
        if osm_id in seen:
            continue
        seen.add(osm_id)
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("name:ru") or ""
        if not name:
            continue
        place = tags.get("place", "")
        lon = el.get("lon")
        lat = el.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "place": place,
                "priority": PRIORITY.get(place, 9),
                "population": int(tags["population"]) if tags.get("population", "").isdigit() else None,
            },
        })
    # Сортируем: важные города первыми (MapLibre рисует по порядку features при коллизии)
    features.sort(key=lambda f: f["properties"]["priority"])
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="58.5,27.8,61.8,36.0",
                    help="min_lat,min_lon,max_lat,max_lon")
    ap.add_argument("--out", default="data/tiles/places.geojson")
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"bbox: {args.bbox}")
    elements = fetch(args.bbox)

    geojson = elements_to_geojson(elements)
    n = len(geojson["features"])
    print(f"features after dedup+filter: {n}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"saved: {out_path}  ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
