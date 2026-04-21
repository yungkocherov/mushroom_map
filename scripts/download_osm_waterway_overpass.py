"""
Скачивает OSM водотоки (waterway=stream/river/canal) для Ленобласти через
Overpass API, сохраняет как GeoJSON для ingest_waterway.py.

Полигональные водоёмы (озёра/моря) уже в water_zone — здесь только LineString
(ручьи, реки-линии, каналы). Это критичный сигнал для грибов: ручьи в лесу =
влажность = плодоношение.

stream + river + canal в bbox ЛО ≈ 30-50k ways → делим bbox на сетку.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

BBOX = (58.5, 27.8, 61.8, 33.0)  # (south, west, north, east) — default LO
SPLIT = 3

# Расширенный bbox для захвата Новгорода/Пскова/Карельского перешейка.
# Переключатель — переменная окружения WATERWAY_BBOX (south,west,north,east).
_env_bbox = os.environ.get("WATERWAY_BBOX")
if _env_bbox:
    parts = [float(x) for x in _env_bbox.split(",")]
    if len(parts) == 4:
        BBOX = tuple(parts)
        SPLIT = int(os.environ.get("WATERWAY_SPLIT", "4"))
        print(f"override BBOX={BBOX} SPLIT={SPLIT}")

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def sub_bboxes() -> list[tuple[float, float, float, float]]:
    s, w, n, e = BBOX
    lat_step = (n - s) / SPLIT
    lon_step = (e - w) / SPLIT
    return [
        (s + i * lat_step, w + j * lon_step,
         s + (i + 1) * lat_step, w + (j + 1) * lon_step)
        for i in range(SPLIT) for j in range(SPLIT)
    ]


def build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    return f"""[out:json][timeout:300];
(
  way["waterway"~"^(stream|river|canal|drain|ditch)$"]({s},{w},{n},{e});
);
out geom;
"""


def fetch_tile(bbox: tuple[float, float, float, float]) -> list[dict]:
    body = build_query(bbox).encode("utf-8")
    last_err = None
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(
                ep, data=body,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "mushroom-map/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=400) as resp:
                return json.loads(resp.read()).get("elements") or []
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All endpoints failed for bbox={bbox}: {last_err}")


def main() -> None:
    tiles = sub_bboxes()
    print(f"Splitting bbox into {len(tiles)} subregions ({SPLIT}x{SPLIT})")

    all_features: dict[int, dict] = {}
    for idx, bbox in enumerate(tiles, 1):
        t0 = time.time()
        try:
            elems = fetch_tile(bbox)
        except Exception as e:
            print(f"  tile {idx}/{len(tiles)} FAILED: {e}", flush=True)
            continue
        added = 0
        for el in elems:
            if el.get("type") != "way":
                continue
            wid = el.get("id")
            if wid in all_features:
                continue
            coords = [[p["lon"], p["lat"]] for p in (el.get("geometry") or []) if p]
            if len(coords) < 2:
                continue
            tags = el.get("tags") or {}
            all_features[wid] = {
                "type": "Feature",
                "properties": {
                    "@id": f"way/{wid}",
                    "waterway": tags.get("waterway"),
                    "name": tags.get("name"),
                    "intermittent": tags.get("intermittent"),
                },
                "geometry": {"type": "LineString", "coordinates": coords},
            }
            added += 1
        print(
            f"  tile {idx}/{len(tiles)} bbox=({bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f}) "
            f"elems={len(elems)} new={added} total={len(all_features)} in {time.time()-t0:.1f}s",
            flush=True,
        )

    if not all_features:
        sys.exit("No features collected")

    os.makedirs("data/osm", exist_ok=True)
    out_path = "data/osm/waterway_lenoblast.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": list(all_features.values())},
            f, ensure_ascii=False, separators=(",", ":"),
        )
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"saved: {out_path} ({len(all_features)} features, {size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
