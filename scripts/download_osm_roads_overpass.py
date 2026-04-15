"""
Скачивает OSM дороги (track/path/footway/bridleway/cycleway) для Ленобласти
через Overpass API, сохраняет как GeoJSON в формате, который читает
ingest_osm_roads.py.

350k+ ways в полном bbox Ленобласти — слишком много для одного запроса
(Gateway Timeout). Делим bbox на сетку SPLIT×SPLIT и качаем по кусочкам,
дедупим по OSM way id, мёрджим.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

# (south, west, north, east)
BBOX = (58.5, 27.8, 61.8, 33.0)
SPLIT = 3  # 3x3 = 9 tiles, ~40k ways каждый — проходит за 30-60 сек на тайл

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def sub_bboxes() -> list[tuple[float, float, float, float]]:
    s, w, n, e = BBOX
    lat_step = (n - s) / SPLIT
    lon_step = (e - w) / SPLIT
    out = []
    for i in range(SPLIT):
        for j in range(SPLIT):
            out.append((
                s + i * lat_step,
                w + j * lon_step,
                s + (i + 1) * lat_step,
                w + (j + 1) * lon_step,
            ))
    return out


def build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    return f"""[out:json][timeout:300];
(
  way["highway"~"^(track|path|footway|bridleway|cycleway)$"]({s},{w},{n},{e});
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
                data = json.loads(resp.read())
            elems = data.get("elements") or []
            return elems
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All endpoints failed for bbox={bbox}: {last_err}")


def main() -> None:
    tiles = sub_bboxes()
    print(f"Splitting bbox into {len(tiles)} subregions ({SPLIT}x{SPLIT})")

    # id → Feature (deduped)
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
                    "highway": tags.get("highway"),
                    "name": tags.get("name"),
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

    features = list(all_features.values())
    os.makedirs("data/osm", exist_ok=True)
    out_path = "data/osm/roads_lenoblast.geojson"
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
