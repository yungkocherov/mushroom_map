"""
Загружает лесные полигоны для региона через выбранный ForestSource.

Использование:
    python pipelines/ingest_forest.py --source osm --region lenoblast
    python pipelines/ingest_forest.py --source osm --region lenoblast --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Добавляем src директории в PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "geodata", "src"))

import psycopg

from geodata.db import get_region_id, upsert_forest_polygons
from geodata.sources import get_source
from geodata.sources.copernicus import CopernicusConfig, CopernicusForestSource
from geodata.sources.terranorte import TerraNorteForestSource
from geodata.types import BoundingBox


def get_region_bbox(conn: psycopg.Connection, code: str) -> BoundingBox:
    row = conn.execute(
        """
        SELECT
            ST_XMin(bbox) AS min_lon,
            ST_YMin(bbox) AS min_lat,
            ST_XMax(bbox) AS max_lon,
            ST_YMax(bbox) AS max_lat
        FROM region WHERE code = %s
        """,
        (code,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Регион {code!r} не найден")
    return BoundingBox(
        min_lon=float(row[0]),
        min_lat=float(row[1]),
        max_lon=float(row[2]),
        max_lat=float(row[3]),
    )


def _load_env() -> None:
    """Мягко подхватываем .env если он есть (как делают другие пайплайны)."""
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).parent.parent / ".env")
    except ImportError:
        pass


def _build_dsn_fallback() -> str | None:
    if (url := os.environ.get("DATABASE_URL")):
        return url
    user = os.environ.get("POSTGRES_USER")
    if not user:
        return None
    pw = os.environ.get("POSTGRES_PASSWORD", "")
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def _build_raster_source(
    args: argparse.Namespace,
    source_name: str,
) -> CopernicusForestSource:
    """Строит CopernicusForestSource или TerraNorteForestSource из CLI-флагов.

    Оба источника используют одну и ту же конфигурацию (CopernicusConfig);
    отличаются только class_code, default class_map и папкой по умолчанию.
    Флаги --copernicus-* работают и для terranorte — имя историческое.
    """
    if source_name == "terranorte":
        source = TerraNorteForestSource()
    else:
        source = CopernicusForestSource()
    cfg = source.config  # стартуем с дефолтов конкретного источника

    if args.copernicus_dir:
        cfg.download_dir = Path(args.copernicus_dir)
    if args.copernicus_tcd_dir:
        cfg.tcd_dir = Path(args.copernicus_tcd_dir)
    if args.copernicus_product:
        cfg.product = args.copernicus_product
    if args.copernicus_min_m2 is not None:
        cfg.min_polygon_m2 = float(args.copernicus_min_m2)
    if args.copernicus_tcd_min is not None:
        cfg.tcd_min = int(args.copernicus_tcd_min)
    # маппинг классов: если задан файл YAML/JSON — загружаем
    if args.copernicus_class_map:
        path = Path(args.copernicus_class_map)
        if not path.exists():
            raise SystemExit(f"class map {path} не найден")
        if path.suffix in (".yaml", ".yml"):
            import yaml
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        else:
            import json
            data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise SystemExit("class map должен быть object {class_code: slug}")
        cfg.class_map = {int(k): v for k, v in data.items()}
    return source


def main() -> None:
    _load_env()
    parser = argparse.ArgumentParser(description="Ingest forest polygons for a region")
    parser.add_argument("--source", required=True,
                        choices=["osm", "copernicus", "terranorte"],
                        help="Forest data source")
    parser.add_argument("--region", required=True,
                        help="Region code from table region (e.g. lenoblast)")
    parser.add_argument("--dsn", default=None,
                        help="PostgreSQL DSN; если не задан — берётся из $DATABASE_URL")
    parser.add_argument("--dry-run", action="store_true",
                        help="Только скачать и распарсить, не писать в БД")

    cop = parser.add_argument_group("copernicus options")
    cop.add_argument("--copernicus-dir", default=None,
                     help="Директория с GeoTIFF-тайлами "
                          "(по умолчанию data/copernicus/tree_species)")
    cop.add_argument("--copernicus-tcd-dir", default=None,
                     help="Опциональная директория с Tree Cover Density растрами "
                          "для фильтра 'не лес'")
    cop.add_argument("--copernicus-product", default=None,
                     help="Слаг продукта для source_version, напр. hrl-dlt-2018")
    cop.add_argument("--copernicus-class-map", default=None,
                     help="Путь к YAML/JSON с маппингом {класс: slug}")
    cop.add_argument("--copernicus-min-m2", type=float, default=None,
                     help="Минимальная площадь полигона в m2 (отбрасываем мелкие лоскуты)")
    cop.add_argument("--copernicus-tcd-min", type=int, default=None,
                     help="Пороговое значение tree cover density 0..100 (если tcd-dir задан)")

    args = parser.parse_args()

    dsn = args.dsn or _build_dsn_fallback()
    if not dsn:
        print("ERROR: DATABASE_URL не задан", file=sys.stderr)
        sys.exit(2)

    print(f"=== ingest_forest source={args.source} region={args.region} ===")
    t0 = time.time()

    with psycopg.connect(dsn) as conn:
        region_id = get_region_id(conn, args.region)
        bbox = get_region_bbox(conn, args.region)
        print(f"Регион id={region_id}, bbox={bbox}")

        if args.source in ("copernicus", "terranorte"):
            source = _build_raster_source(args, args.source)
        else:
            SourceClass = get_source(args.source)
            source = SourceClass()

        print(f"Скачиваю данные через {args.source}...")
        normalized = source.fetch_normalized(bbox)

        if args.dry_run:
            count = 0
            for poly in normalized:
                count += 1
                if count <= 5:
                    print(f"  {poly.dominant_species} conf={poly.confidence:.1f} "
                          f"area={poly.area_m2 / 10_000:.1f}га  {poly.source_feature_id}")
            print(f"\nDry-run: распарсено {count} полигонов, в БД не пишем.")
        else:
            count = upsert_forest_polygons(conn, region_id, normalized, verbose=True)
            conn.commit()
            print(f"\nГотово: {count} полигонов за {time.time() - t0:.1f}с")
            if args.source in ("copernicus", "terranorte"):
                print(
                    "\nНапоминание: после этого нужно перегенерировать PMTiles:\n"
                    "    python pipelines/build_tiles.py"
                )


if __name__ == "__main__":
    main()
