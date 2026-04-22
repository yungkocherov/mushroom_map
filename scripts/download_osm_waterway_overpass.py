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

from _bbox import LO_BBOX_DEFAULT, load_bbox, load_split
from _overpass import overpass_elements

# Расширенный bbox для захвата Новгорода/Пскова/Карельского перешейка задаётся
# через WATERWAY_BBOX (south,west,north,east). Default — LO.
BBOX = load_bbox("WATERWAY_BBOX", LO_BBOX_DEFAULT)
SPLIT = load_split("WATERWAY_SPLIT", 3 if BBOX == LO_BBOX_DEFAULT else 4)
if BBOX != LO_BBOX_DEFAULT:
    print(f"override BBOX={BBOX} SPLIT={SPLIT}")


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
    return overpass_elements(build_query(bbox), timeout_s=400)


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
