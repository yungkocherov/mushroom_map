"""
fgislk_tiles_to_geojson: превращает скачанные MVT-тайлы ФГИС ЛК в один GeoJSON
с лесотаксационными выделами (TAXATION_PIECE_PVS).

Что делает:
    1. Проходит по всем .pbf файлам в input-директории.
    2. Для каждого — декодирует MVT, берёт source-layer `TAXATION_PIECE_PVS`.
    3. Координаты фич — локальные для тайла [0..extent]. Пересчитывает их в
       EPSG:3857 по границам тайла (origin, units_per_pixel × tile_size),
       затем в EPSG:4326 через pyproj.
    4. Дедуплицирует по `externalid` — один выдел обычно присутствует в
       нескольких тайлах (на границах). Для дубликатов предпочитает вариант
       с большей площадью (более цельная геометрия).
    5. Маппит русские названия пород в наши slug'и (pine/spruce/...).
    6. Сохраняет как GeoJSON FeatureCollection с полями:
         - externalid, label_name, tree_species (raw)
         - species_slug (наш slug) / species_composition (тривиальная {slug: 1.0})
         - age_group (raw)
         - source_layer = "TAXATION_PIECE_PVS"

Использование:
    python pipelines/fgislk_tiles_to_geojson.py \\
        --in data/rosleshoz/fgislk_tiles \\
        --out data/rosleshoz/fgislk_vydels.geojson
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import mapbox_vector_tile
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform as shapely_transform, unary_union


# ─── GWC grid (должно совпадать с download_fgislk_tiles.py) ───────────────────
ORIGIN_X = -20037508.34
ORIGIN_Y = -20037508.34
TILE_SIZE = 256
UPP: dict[int, float] = {7: 140.0, 8: 56.0, 9: 28.0, 10: 14.0, 11: 7.0, 12: 2.8}

TARGET_SOURCE_LAYER = "TAXATION_PIECE_PVS"
BONITET_LAYER = "TAXATION_PIECE_BONITET"
TIMBER_LAYER = "TAXATION_PIECE_TIMBER_STOCK"

# Слои водоохранных зон — берём только те типы, которые указывают на близость воды
WATER_LAYERS = ["PROTECTIVE_FOREST", "PROTECTIVE_FOREST_SUBCATEGORY", "SPECIAL_CONDITION_AREA"]
WATER_TYPE_ALLOWLIST = {
    "Леса, расположенные в водоохранных зонах",
    "Нерестоохранные полосы лесов",
    "Водоохранная зона",
}


# ─── Русские имена пород → наш slug ───────────────────────────────────────────
#
# Мы сознательно оставили slug'ов меньше, чем реальных видов — группируем
# «осина», «тополь белый» в один aspen и т.п. Любое не-маппящееся значение
# попадёт в meta.unknown_species.

TREE_SPECIES_TO_SLUG: dict[str, str] = {
    # Хвойные
    "ель": "spruce",
    "ель европейская": "spruce",
    "ель сибирская": "spruce",
    "ель финская": "spruce",
    "сосна": "pine",
    "сосна обыкновенная": "pine",
    "сосна кедровая": "cedar",
    "сосна сибирская": "cedar",
    "кедр": "cedar",
    "кедр сибирский": "cedar",
    "пихта": "fir",
    "пихта сибирская": "fir",
    "лиственница": "larch",
    "лиственница сибирская": "larch",
    "лиственница европейская": "larch",
    # Мелколиственные
    "береза": "birch",
    "берёза": "birch",
    "берёза повислая": "birch",
    "береза повислая": "birch",
    "берёза пушистая": "birch",
    "осина": "aspen",
    "тополь": "aspen",
    "тополь дрожащий": "aspen",
    "ольха": "alder",
    "ольха серая": "alder",
    "ольха чёрная": "alder",
    "ольха черная": "alder",
    "ольха серая (белая)": "alder",
    # Широколиственные
    "дуб": "oak",
    "дуб черешчатый": "oak",
    "липа": "linden",
    "липа мелколистная": "linden",
    "клён": "maple",
    "клен": "maple",
    "клён остролистный": "maple",
}


def species_label_to_slug(label: str) -> Optional[str]:
    """Нормализует русскую метку и возвращает slug или None."""
    if not label:
        return None
    norm = re.sub(r"\s+", " ", label.strip().lower().replace("ё", "е"))
    if norm in TREE_SPECIES_TO_SLUG:
        return TREE_SPECIES_TO_SLUG[norm]
    # Удалим уточнения в скобках «ольха серая (белая)» → «ольха серая»
    without_parens = re.sub(r"\s*\([^)]*\)", "", norm).strip()
    if without_parens and without_parens in TREE_SPECIES_TO_SLUG:
        return TREE_SPECIES_TO_SLUG[without_parens]
    # Первое слово тоже попробуем («берёза повислая» → «берёза»)
    first = norm.split()[0] if norm.split() else ""
    if first in TREE_SPECIES_TO_SLUG:
        return TREE_SPECIES_TO_SLUG[first]
    return None


# ─── Tile math ────────────────────────────────────────────────────────────────

def tile_bounds_3857(zoom: int, x: int, y: int) -> tuple[float, float, float, float]:
    upt = UPP[zoom] * TILE_SIZE
    return (
        ORIGIN_X + x * upt,
        ORIGIN_Y + y * upt,
        ORIGIN_X + (x + 1) * upt,
        ORIGIN_Y + (y + 1) * upt,
    )


def make_tile_to_4326(zoom: int, x: int, y: int, extent: int):
    """Возвращает shapely-совместимую функцию (px, py) -> (lon, lat)."""
    minx, miny, maxx, maxy = tile_bounds_3857(zoom, x, y)
    to4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

    def transform(xs, ys, zs=None):
        # shapely 2 передаёт (xs, ys) либо (xs, ys, zs) как arrays-like
        lons = []
        lats = []
        for px, py in zip(xs, ys):
            # ФГИС GWC кодирует геометрию с y=0 внизу (TMS, не стандартный MVT).
            # EPSG:3857 tile bounds: (minx, miny) = bottom-left, (maxx, maxy) = top-right
            # Значит lon = minx + (px/extent)*(maxx-minx)
            #       lat_meters = miny + (py/extent)*(maxy-miny)   ← НЕТ Y-flip
            mx = minx + (px / extent) * (maxx - minx)
            my = miny + (py / extent) * (maxy - miny)
            lon, lat = to4326.transform(mx, my)
            lons.append(lon)
            lats.append(lat)
        if zs is not None:
            return lons, lats, zs
        return lons, lats

    return transform


# ─── Стата ────────────────────────────────────────────────────────────────────

@dataclass
class VydelRecord:
    externalid: str
    label_name: Optional[str]
    tree_species_raw: Optional[str]
    species_slug: Optional[str]
    age_group: Optional[str]
    zoom: int = 0                              # зум, из которого взята геометрия
    polygon_parts: list[Polygon] = field(default_factory=list)
    bonitet: Optional[int] = None             # класс бонитета 1..5
    timber_stock: Optional[float] = None      # запас древесины, м³/га


@dataclass
class WaterZoneRecord:
    externalid: str
    zone_type: str
    layer_name: str
    zoom: int = 0
    polygon_parts: list[Polygon] = field(default_factory=list)


@dataclass
class Stats:
    tiles_total: int = 0
    tiles_ok: int = 0
    tiles_empty_pvs: int = 0
    features_seen: int = 0
    unique_vydels: int = 0
    unknown_species: dict[str, int] = field(default_factory=dict)


# ─── Основная логика ─────────────────────────────────────────────────────────

def process_tile(
    pbf_bytes: bytes,
    zoom: int,
    tx: int,
    ty: int,
    records: dict[str, VydelRecord],
    water_records: dict[str, WaterZoneRecord],
    stats: Stats,
) -> None:
    try:
        decoded = mapbox_vector_tile.decode(pbf_bytes)
    except Exception:
        return
    layer = decoded.get(TARGET_SOURCE_LAYER)
    if not layer:
        stats.tiles_empty_pvs += 1
        return
    feats = layer.get("features") or []
    if not feats:
        stats.tiles_empty_pvs += 1
        return
    extent = layer.get("extent", 4096)
    tx_transform = make_tile_to_4326(zoom, tx, ty, extent)

    for feat in feats:
        stats.features_seen += 1
        props = feat.get("properties") or {}
        externalid = props.get("externalid")
        if not externalid:
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
        # Геометрия в тайловых координатах — перепроецируем в 4326
        try:
            geom_wgs = shapely_transform(tx_transform, geom)
        except Exception:
            continue
        if geom_wgs.is_empty or not geom_wgs.is_valid:
            geom_wgs = geom_wgs.buffer(0)
            if geom_wgs.is_empty or not geom_wgs.is_valid:
                continue

        tree_species = props.get("tree_species")
        slug = species_label_to_slug(tree_species or "")
        if tree_species and not slug:
            stats.unknown_species[tree_species] = stats.unknown_species.get(tree_species, 0) + 1

        rec = records.get(externalid)
        if rec is None:
            rec = VydelRecord(
                externalid=str(externalid),
                label_name=props.get("label_name"),
                tree_species_raw=tree_species,
                species_slug=slug,
                age_group=props.get("age_group"),
                zoom=zoom,
            )
            records[externalid] = rec
        elif zoom > rec.zoom:
            # Нашли тот же выдел на более детальном зуме — сбрасываем грубую геометрию
            rec.zoom = zoom
            rec.polygon_parts.clear()
        elif zoom < rec.zoom:
            # Уже есть более детальная версия — пропускаем
            continue

        # Добавим полигон(ы) в накопитель (только для текущего zoom уровня)
        if isinstance(geom_wgs, Polygon):
            rec.polygon_parts.append(geom_wgs)
        elif isinstance(geom_wgs, MultiPolygon):
            rec.polygon_parts.extend(list(geom_wgs.geoms))

    # ── Бонитет ──────────────────────────────────────────────────────────────
    bonitet_layer = decoded.get(BONITET_LAYER)
    if bonitet_layer:
        b_extent = bonitet_layer.get("extent", 4096)
        b_transform = make_tile_to_4326(zoom, tx, ty, b_extent)
        for feat in bonitet_layer.get("features") or []:
            props = feat.get("properties") or {}
            eid = props.get("externalid")
            if not eid or eid not in records:
                continue
            yc = props.get("yield_class")
            if yc is not None:
                try:
                    records[eid].bonitet = int(str(yc).strip())
                except (ValueError, TypeError):
                    pass

    # ── Запас древесины ───────────────────────────────────────────────────────
    timber_layer = decoded.get(TIMBER_LAYER)
    if timber_layer:
        t_extent = timber_layer.get("extent", 4096)
        t_transform = make_tile_to_4326(zoom, tx, ty, t_extent)
        for feat in timber_layer.get("features") or []:
            props = feat.get("properties") or {}
            eid = props.get("externalid")
            if not eid or eid not in records:
                continue
            ts = props.get("timber_stock")
            if ts is not None:
                try:
                    records[eid].timber_stock = float(ts)
                except (ValueError, TypeError):
                    pass

    # ── Водоохранные зоны ─────────────────────────────────────────────────────
    for layer_name in WATER_LAYERS:
        wlayer = decoded.get(layer_name)
        if not wlayer:
            continue
        w_extent = wlayer.get("extent", 4096)
        w_transform = make_tile_to_4326(zoom, tx, ty, w_extent)
        for feat in wlayer.get("features") or []:
            props = feat.get("properties") or {}
            zone_type = str(props.get("type") or "")
            if zone_type not in WATER_TYPE_ALLOWLIST:
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
                geom_wgs = shapely_transform(w_transform, geom)
            except Exception:
                continue
            if geom_wgs.is_empty or not geom_wgs.is_valid:
                geom_wgs = geom_wgs.buffer(0)
                if geom_wgs.is_empty or not geom_wgs.is_valid:
                    continue

            wrec = water_records.get(eid)
            if wrec is None:
                wrec = WaterZoneRecord(
                    externalid=str(eid),
                    zone_type=zone_type,
                    layer_name=layer_name,
                    zoom=zoom,
                )
                water_records[eid] = wrec
            elif zoom < wrec.zoom:
                continue
            elif zoom > wrec.zoom:
                wrec.zoom = zoom
                wrec.polygon_parts.clear()

            if isinstance(geom_wgs, Polygon):
                wrec.polygon_parts.append(geom_wgs)
            elif isinstance(geom_wgs, MultiPolygon):
                wrec.polygon_parts.extend(list(geom_wgs.geoms))


def iter_pbf_files(root: Path) -> list[tuple[Path, int, int, int]]:
    """Находит все pbf-файлы в дереве {root}/{z}/{x}/{y}.pbf."""
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


def build_geojson(records: dict[str, VydelRecord], stats: Stats) -> dict:
    features: list[dict] = []
    for externalid, rec in records.items():
        parts = rec.polygon_parts
        if not parts:
            continue
        # Сливаем все куски, полученные из соседних тайлов, в одну геометрию
        try:
            merged = unary_union(parts)
        except Exception:
            merged = parts[0]
        if merged.is_empty:
            continue
        if isinstance(merged, Polygon):
            multi = MultiPolygon([merged])
        elif isinstance(merged, MultiPolygon):
            multi = merged
        else:
            continue

        props: dict[str, Any] = {
            "externalid": rec.externalid,
            "label_name": rec.label_name,
            "tree_species": rec.tree_species_raw,
            "species_slug": rec.species_slug,
            "age_group": rec.age_group,
            "source_layer": TARGET_SOURCE_LAYER,
            "bonitet": rec.bonitet,
            "timber_stock": rec.timber_stock,
        }
        if rec.species_slug:
            # для совместимости с RosleshozForestSource — делаем «формулу»
            props["formula"] = rec.tree_species_raw  # raw русское слово
            props["species_composition"] = {rec.species_slug: 1.0}
            props["dominant_species"] = rec.species_slug

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": mapping(multi),
        })

    stats.unique_vydels = len(features)
    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


def build_water_geojson(water_records: dict[str, WaterZoneRecord]) -> dict:
    features: list[dict] = []
    for eid, rec in water_records.items():
        parts = rec.polygon_parts
        if not parts:
            continue
        try:
            merged = unary_union(parts)
        except Exception:
            merged = parts[0]
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
                "zone_type": rec.zone_type,
                "layer_name": rec.layer_name,
            },
            "geometry": mapping(multi),
        })
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/rosleshoz/fgislk_tiles",
                    help="Корень с скачанными pbf-тайлами")
    ap.add_argument("--out", default="data/rosleshoz/fgislk_vydels.geojson",
                    help="Куда сохранить финальный GeoJSON")
    ap.add_argument("--out-water", default="data/rosleshoz/fgislk_water_zones.geojson",
                    help="Куда сохранить водоохранные зоны")
    args = ap.parse_args()

    in_root = Path(args.inp)
    if not in_root.exists():
        raise SystemExit(f"нет директории {in_root}. Сначала запусти download_fgislk_tiles.py")

    tiles = iter_pbf_files(in_root)
    # Сортируем по зуму — сначала грубые, потом детальные.
    # Так при встрече выдела на более детальном зуме мы сбросим грубую геометрию.
    tiles.sort(key=lambda t: t[1])
    print(f"Найдено pbf-файлов: {len(tiles)}, зумы: {sorted(set(t[1] for t in tiles))}")
    if not tiles:
        raise SystemExit("нет тайлов для обработки")

    records: dict[str, VydelRecord] = {}
    water_records: dict[str, WaterZoneRecord] = {}
    stats = Stats(tiles_total=len(tiles))

    for i, (pbf_path, z, x, y) in enumerate(tiles):
        try:
            pbf_bytes = pbf_path.read_bytes()
        except Exception:
            continue
        if len(pbf_bytes) == 0:
            continue
        process_tile(pbf_bytes, z, x, y, records, water_records, stats)
        stats.tiles_ok += 1
        if (i + 1) % 200 == 0 or i == len(tiles) - 1:
            print(f"  {i+1}/{len(tiles)} tiles  unique_vydels={len(records)}  water_zones={len(water_records)}")

    geojson = build_geojson(records, stats)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nsaved vydels: {out_path} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")

    water_geojson = build_water_geojson(water_records)
    water_path = Path(args.out_water)
    water_path.parent.mkdir(parents=True, exist_ok=True)
    water_path.write_text(
        json.dumps(water_geojson, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"saved water:  {water_path} ({water_path.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"  water zones: {len(water_geojson['features'])}")

    print("\n=== Статистика ===")
    print(f"  tiles_total:      {stats.tiles_total}")
    print(f"  tiles_ok:         {stats.tiles_ok}")
    print(f"  tiles_empty_pvs:  {stats.tiles_empty_pvs}")
    print(f"  features_seen:    {stats.features_seen}")
    print(f"  unique_vydels:    {stats.unique_vydels}")
    if stats.unknown_species:
        print(f"  unknown species (top 20):")
        top = sorted(stats.unknown_species.items(), key=lambda x: -x[1])[:20]
        for sp, n in top:
            print(f"    {sp!r}: {n}")

    print(f"\nДальше:")
    print(f"  python db/migrate.py   # применит миграцию 010 если ещё не применена")
    print(f"  python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \\")
    print(f"      --rosleshoz-file {out_path} \\")
    print(f"      --rosleshoz-formula-field tree_species \\")
    print(f"      --rosleshoz-version fgislk-2026")


if __name__ == "__main__":
    main()
