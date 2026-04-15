"""
Экстрактор из ФГИС ЛК тайлового кэша для ДВУХ новых слоёв:
    - SPECIAL_CONDITION_AREA → felling_areas (вырубки, гари, погибшие насаждения)
    - PROTECTIVE_FOREST      → protective_forest (защитные леса)

Реиспользует тот же тайл-кеш что и `pipelines/fgislk_tiles_to_geojson.py`,
но вытаскивает только нужные слои без trunkation или перепроцессинга vydels.

Исключает water-zone типы, которые уже в `water_zone` таблице:
    - Водоохранная зона
    - Леса, расположенные в водоохранных зонах
    - Нерестоохранные полосы лесов

Output:
    data/rosleshoz/fgislk_felling.geojson       (features: special_type)
    data/rosleshoz/fgislk_protective.geojson    (features: protect_type)

Производительность: multiprocessing по X-директориям. На 702k тайлов и
8 workers — 5-10 минут.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import mapbox_vector_tile
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform as shapely_transform, unary_union

# ─── GWC grid (должно совпадать с download_fgislk_tiles.py) ───────────────────
ORIGIN_X = -20037508.34
ORIGIN_Y = -20037508.34
TILE_SIZE = 256
UPP: dict[int, float] = {7: 140.0, 8: 56.0, 9: 28.0, 10: 14.0, 11: 7.0, 12: 2.8}

# Слои ФГИС ЛК, которые нас интересуют
FELLING_LAYER = "SPECIAL_CONDITION_AREA"
PROTECTIVE_LAYERS = ["PROTECTIVE_FOREST", "PROTECTIVE_FOREST_SUBCATEGORY"]

# Эти типы уже уехали в water_zone — не дублируем
WATER_TYPES = {
    "Леса, расположенные в водоохранных зонах",
    "Нерестоохранные полосы лесов",
    "Водоохранная зона",
}


@dataclass
class AreaRecord:
    externalid: str
    area_type: str
    layer_name: str
    zoom: int = 0
    polygon_parts: list[Polygon] = field(default_factory=list)


# ─── Tile math (копия из fgislk_tiles_to_geojson.py) ──────────────────────────


def tile_bounds_3857(zoom: int, x: int, y: int) -> tuple[float, float, float, float]:
    upt = UPP[zoom] * TILE_SIZE
    return (
        ORIGIN_X + x * upt,
        ORIGIN_Y + y * upt,
        ORIGIN_X + (x + 1) * upt,
        ORIGIN_Y + (y + 1) * upt,
    )


def make_tile_to_4326(zoom: int, x: int, y: int, extent: int):
    minx, miny, maxx, maxy = tile_bounds_3857(zoom, x, y)
    to4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

    def transform(xs, ys, zs=None):
        lons, lats = [], []
        for px, py in zip(xs, ys):
            mx = minx + (px / extent) * (maxx - minx)
            my = miny + (py / extent) * (maxy - miny)
            lon, lat = to4326.transform(mx, my)
            lons.append(lon)
            lats.append(lat)
        if zs is not None:
            return lons, lats, zs
        return lons, lats

    return transform


# ─── Processing ───────────────────────────────────────────────────────────────


def process_layer_features(
    layer: dict,
    zoom: int, tx: int, ty: int,
    records: dict[str, AreaRecord],
    layer_name: str,
    exclude_types: set[str],
) -> None:
    if not layer:
        return
    feats = layer.get("features") or []
    if not feats:
        return
    extent = layer.get("extent", 4096)
    tx_transform = make_tile_to_4326(zoom, tx, ty, extent)

    for feat in feats:
        props = feat.get("properties") or {}
        area_type = str(props.get("type") or "").strip()
        if not area_type or area_type in exclude_types:
            continue
        eid = props.get("externalid")
        if not eid:
            continue
        raw_geom = feat.get("geometry")
        if not raw_geom:
            continue
        try:
            geom = shape(raw_geom)
        except Exception:
            continue
        if geom.is_empty:
            continue
        try:
            geom_wgs = shapely_transform(tx_transform, geom)
        except Exception:
            continue
        if geom_wgs.is_empty or not geom_wgs.is_valid:
            geom_wgs = geom_wgs.buffer(0)
            if geom_wgs.is_empty or not geom_wgs.is_valid:
                continue

        rec = records.get(str(eid))
        if rec is None:
            rec = AreaRecord(
                externalid=str(eid),
                area_type=area_type,
                layer_name=layer_name,
                zoom=zoom,
            )
            records[str(eid)] = rec
        elif zoom > rec.zoom:
            rec.zoom = zoom
            rec.polygon_parts.clear()
        elif zoom < rec.zoom:
            continue

        if isinstance(geom_wgs, Polygon):
            rec.polygon_parts.append(geom_wgs)
        elif isinstance(geom_wgs, MultiPolygon):
            rec.polygon_parts.extend(list(geom_wgs.geoms))


def process_chunk(tiles: list[tuple[str, int, int, int]]) -> tuple[dict[str, AreaRecord], dict[str, AreaRecord], int]:
    felling: dict[str, AreaRecord] = {}
    protective: dict[str, AreaRecord] = {}
    ok = 0
    for path_str, z, x, y in tiles:
        try:
            pbf_bytes = Path(path_str).read_bytes()
        except Exception:
            continue
        if not pbf_bytes:
            continue
        try:
            decoded = mapbox_vector_tile.decode(pbf_bytes)
        except Exception:
            continue
        ok += 1
        # Felling (SPECIAL_CONDITION_AREA minus water types)
        process_layer_features(
            decoded.get(FELLING_LAYER), z, x, y, felling, FELLING_LAYER, WATER_TYPES,
        )
        # Protective (PROTECTIVE_FOREST minus water types)
        for layer_name in PROTECTIVE_LAYERS:
            process_layer_features(
                decoded.get(layer_name), z, x, y, protective, layer_name, WATER_TYPES,
            )
    return felling, protective, ok


def merge_records(dst: dict[str, AreaRecord], src: dict[str, AreaRecord]) -> None:
    for eid, sr in src.items():
        dr = dst.get(eid)
        if dr is None:
            dst[eid] = sr
        elif sr.zoom > dr.zoom:
            dst[eid] = sr
        elif sr.zoom == dr.zoom:
            dr.polygon_parts.extend(sr.polygon_parts)


def build_geojson(records: dict[str, AreaRecord]) -> dict:
    features = []
    for rec in records.values():
        if not rec.polygon_parts:
            continue
        try:
            merged = unary_union(rec.polygon_parts)
        except Exception:
            merged = rec.polygon_parts[0]
        if merged.is_empty:
            continue
        if isinstance(merged, Polygon):
            multi = MultiPolygon([merged])
        elif isinstance(merged, MultiPolygon):
            multi = merged
        else:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "externalid": rec.externalid,
                "area_type": rec.area_type,
                "layer_name": rec.layer_name,
            },
            "geometry": mapping(multi),
        })
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def iter_pbf_files(root: Path) -> list[tuple[Path, int, int, int]]:
    out: list[tuple[Path, int, int, int]] = []
    for pbf in root.rglob("*.pbf"):
        parts = pbf.relative_to(root).parts
        if len(parts) != 3:
            continue
        try:
            z = int(parts[0])
            x = int(parts[1])
            y = int(parts[2].removesuffix(".pbf"))
        except ValueError:
            continue
        out.append((pbf, z, x, y))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/rosleshoz/fgislk_tiles")
    ap.add_argument("--out-felling", default="data/rosleshoz/fgislk_felling.geojson")
    ap.add_argument("--out-protective", default="data/rosleshoz/fgislk_protective.geojson")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 1))
    args = ap.parse_args()

    in_root = Path(args.inp)
    if not in_root.exists():
        sys.exit(f"нет директории {in_root}")

    tiles = iter_pbf_files(in_root)
    tiles.sort(key=lambda t: t[1])
    print(f"tiles: {len(tiles)}, workers: {args.workers}")
    if not tiles:
        sys.exit("нет тайлов")

    # Chunk by X-dir
    by_x: dict[tuple[int, int], list[tuple[str, int, int, int]]] = {}
    for pbf_path, z, x, y in tiles:
        by_x.setdefault((z, x), []).append((str(pbf_path), z, x, y))
    x_chunks = list(by_x.values())
    per_worker = max(1, len(x_chunks) // args.workers)
    batches: list[list[tuple[str, int, int, int]]] = []
    for i in range(0, len(x_chunks), per_worker):
        flat: list[tuple[str, int, int, int]] = []
        for c in x_chunks[i:i + per_worker]:
            flat.extend(c)
        if flat:
            batches.append(flat)
    print(f"{len(batches)} batches")

    felling: dict[str, AreaRecord] = {}
    protective: dict[str, AreaRecord] = {}
    done_tiles = 0

    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(process_chunk, b): len(b) for b in batches}
        for fut in as_completed(futs):
            lf, lp, ok = fut.result()
            merge_records(felling, lf)
            merge_records(protective, lp)
            done_tiles += futs[fut]
            print(f"  {done_tiles}/{len(tiles)} tiles  felling={len(felling)} protective={len(protective)}", flush=True)

    for name, records, out_path in [
        ("felling", felling, args.out_felling),
        ("protective", protective, args.out_protective),
    ]:
        gj = build_geojson(records)
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(gj, f, ensure_ascii=False, separators=(",", ":"))
        size_mb = os.path.getsize(out_path) / 1024 / 1024
        print(f"saved {name}: {out_path} ({len(gj['features'])} features, {size_mb:.1f} MB)")

    # Статистика по типам
    print("\n=== felling types ===")
    types = {}
    for r in felling.values():
        types[r.area_type] = types.get(r.area_type, 0) + 1
    for t, n in sorted(types.items(), key=lambda x: -x[1])[:20]:
        print(f"  {n:>6}  {t}")

    print("\n=== protective types ===")
    types = {}
    for r in protective.values():
        types[r.area_type] = types.get(r.area_type, 0) + 1
    for t, n in sorted(types.items(), key=lambda x: -x[1])[:20]:
        print(f"  {n:>6}  {t}")


if __name__ == "__main__":
    main()
