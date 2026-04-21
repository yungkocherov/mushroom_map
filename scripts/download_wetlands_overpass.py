"""
Скачивает OSM болота (natural=wetland) для Ленобласти через Overpass API.

Тэги OSM:
    natural=wetland
    wetland=bog|marsh|swamp|fen|... (subcategory)

Сохраняет в GeoJSON `data/osm/wetlands_lenoblast.geojson` с полями:
    @id         — way/<id> или relation/<id>
    wetland     — subcategory
    name        — если есть

3×3 grid bbox splitting (болот меньше чем дорог, но их полигоны крупные).
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
SPLIT = 2  # болот меньше чем дорог — 2×2 достаточно

# Override через env-переменную (для расширения bbox на Новгород/Псков/
# Карельский перешеек). Пример: WETLAND_BBOX=57.5,25.5,62.5,37.0
_env_bbox = os.environ.get("WETLAND_BBOX")
if _env_bbox:
    parts = [float(x) for x in _env_bbox.split(",")]
    if len(parts) == 4:
        BBOX = tuple(parts)
        SPLIT = int(os.environ.get("WETLAND_SPLIT", "4"))
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
  way["natural"="wetland"]({s},{w},{n},{e});
  relation["natural"="wetland"]({s},{w},{n},{e});
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
            return data.get("elements") or []
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All endpoints failed for bbox={bbox}: {last_err}")


def way_to_polygon(way: dict) -> dict | None:
    coords = [[p["lon"], p["lat"]] for p in (way.get("geometry") or []) if p]
    if len(coords) < 3:
        return None
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return {"type": "Polygon", "coordinates": [coords]}


def rel_to_geometry(rel: dict) -> dict | None:
    outers = []
    for m in rel.get("members") or []:
        if m.get("role") != "outer":
            continue
        coords = [[p["lon"], p["lat"]] for p in (m.get("geometry") or []) if p]
        if len(coords) >= 3:
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            outers.append([coords])
    if not outers:
        return None
    if len(outers) == 1:
        return {"type": "Polygon", "coordinates": outers[0]}
    return {"type": "MultiPolygon", "coordinates": outers}


def main() -> None:
    tiles = sub_bboxes()
    print(f"Splitting bbox into {len(tiles)} subregions ({SPLIT}x{SPLIT})")

    seen_ids: set[str] = set()
    features: list[dict] = []

    for idx, bbox in enumerate(tiles, 1):
        t0 = time.time()
        try:
            elems = fetch_tile(bbox)
        except Exception as e:
            print(f"  tile {idx}/{len(tiles)} FAILED: {e}", flush=True)
            continue
        added = 0
        for el in elems:
            key = f"{el.get('type')}/{el.get('id')}"
            if key in seen_ids:
                continue
            tags = el.get("tags") or {}
            if el.get("type") == "way":
                geom = way_to_polygon(el)
            elif el.get("type") == "relation":
                geom = rel_to_geometry(el)
            else:
                continue
            if not geom:
                continue
            seen_ids.add(key)
            features.append({
                "type": "Feature",
                "properties": {
                    "@id": key,
                    "wetland": tags.get("wetland") or "unspecified",
                    "name": tags.get("name:ru") or tags.get("name"),
                },
                "geometry": geom,
            })
            added += 1
        print(
            f"  tile {idx}/{len(tiles)} bbox=({bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f}) "
            f"elems={len(elems)} new={added} total={len(features)} in {time.time()-t0:.1f}s",
            flush=True,
        )

    if not features:
        sys.exit("No wetlands collected")

    os.makedirs("data/osm", exist_ok=True)
    out_path = "data/osm/wetlands_lenoblast.geojson"
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
