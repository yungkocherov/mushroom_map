"""
RosleshozForestSource — читает локальные векторные файлы с таксационными
данными и превращает их в NormalizedForestPolygon с реальной породной
смесью.

Вход
----
Любой векторный файл, который умеет читать GDAL через pyogrio:
    - GeoJSON (.geojson, .json)
    - ESRI Shapefile (.shp + .dbf + .shx + .prj)
    - GeoPackage (.gpkg)
    - FlatGeobuf (.fgb)
    - OpenFileGDB (директория .gdb)

У каждой фичи (выдела) должен быть атрибут с «формулой породного состава»
в русском таксационном формате типа ``6Е3С1Б``. Имя этого атрибута
настраивается через ``RosleshozConfig.formula_field`` (по умолчанию
``"formula"``, есть несколько стандартных альтернатив которые проверяются
автоматически).

Опционально:
    - атрибут ``id_field`` — уникальный id выдела в исходной системе
    - атрибут ``age_field`` — возраст древостоя
    - атрибут ``bonitet_field`` — бонитет

Как работает
------------
1. Открывает файл через pyogrio, читает features батчами.
2. Перепроецирует геометрию в EPSG:4326 если source CRS другой.
3. Парсит формулу через ``parse_species_formula``.
4. Считает dominant_species как породу с максимальной долей.
5. confidence=0.95 (реальные таксационные данные — лучшая точность, что
   у нас есть).
6. source_version = ``rosleshoz-<version_slug>`` — настраивается.

Пример использования
--------------------
    python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \\
        --rosleshoz-file data/rosleshoz/lenoblast_vydels.gpkg \\
        --rosleshoz-formula-field SPECIES_COMP \\
        --rosleshoz-version lo-2024-q1
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import transform as shapely_transform

from geodata.sources.base import ForestSource, RawFeature
from geodata.sources.rosleshoz.formula import (
    FormulaParseError,
    dominant_slug,
    parse_species_formula,
)
from geodata.types import BoundingBox, NormalizedForestPolygon


#: Имена атрибутов, которые проверяются, если `formula_field` не задан явно.
#: Поиск ведётся без учёта регистра.
DEFAULT_FORMULA_FIELD_CANDIDATES: tuple[str, ...] = (
    "formula",
    "species_formula",
    "species_comp",
    "порода",
    "состав",
    "состав_насаждения",
    "формула",
    "taxform",
    "tax_form",
)

DEFAULT_ID_FIELD_CANDIDATES: tuple[str, ...] = (
    "id", "vydel_id", "gid", "objectid", "fid", "номер_выдела", "выдел",
)


@dataclass
class RosleshozConfig:
    """Настройки чтения таксационных выделов."""

    #: Путь к векторному файлу (GeoJSON / Shapefile / GPKG / FlatGeobuf)
    path: Path = field(default_factory=lambda: Path("data/rosleshoz/vydels.gpkg"))

    #: Имя слоя для многослойных форматов (GPKG, GDB). None = первый слой.
    layer: Optional[str] = None

    #: Имя атрибута с формулой состава. Если None — ищем в
    #: DEFAULT_FORMULA_FIELD_CANDIDATES.
    formula_field: Optional[str] = None

    #: Имя атрибута с уникальным id выдела. Если None — ищем автоматически.
    id_field: Optional[str] = None

    #: Минимальная площадь полигона (м²). Таксационные выделы обычно > 0.5 га.
    min_polygon_m2: float = 1_000.0

    #: Слаг версии — идёт в `source_version`. Полезно для хранения
    #: нескольких версий параллельно (разные годы).
    version: str = "local"

    #: Confidence, 0..1. Таксационные описания — это «ground truth»,
    #: поэтому выше чем у Copernicus (0.9) и TerraNorte (0.9).
    confidence: float = 0.95


class RosleshozForestSource(ForestSource):
    """
    Читает локально скачанный векторный файл с таксационными выделами.

    Сам ничего не скачивает: пользователь достаёт файл из Rosleshoz /
    ФГИС ЛК / регионального кадастра (см. ``docs/rosleshoz_download.md``)
    и кладёт в `data/rosleshoz/`. Мы его читаем и нормализуем.
    """

    source_code = "rosleshoz"

    def __init__(self, config: RosleshozConfig | None = None) -> None:
        self.config = config or RosleshozConfig()
        self._fetched_at = dt.date.today()
        self._resolved_formula_field: Optional[str] = None
        self._resolved_id_field: Optional[str] = None

    @property
    def source_version(self) -> str:
        return f"rosleshoz-{self.config.version}"

    # ─── ForestSource API ──────────────────────────────────────────────────

    def fetch(self, bbox: BoundingBox) -> Iterator[RawFeature]:
        """Читает векторный файл и отдаёт features по одной."""
        import pyogrio

        path = Path(self.config.path)
        if not path.exists():
            raise FileNotFoundError(
                f"Rosleshoz: файл {path} не найден. "
                f"См. docs/rosleshoz_download.md — нужно вручную выгрузить "
                f"таксационные выделы и положить сюда."
            )

        # Определяем слои и схему атрибутов
        info = pyogrio.read_info(path, layer=self.config.layer)
        raw_fields = info.get("fields")
        if raw_fields is None:
            field_names: list[str] = []
        else:
            field_names = [str(f) for f in raw_fields]
        self._resolved_formula_field = self._resolve_field(
            self.config.formula_field, field_names, DEFAULT_FORMULA_FIELD_CANDIDATES,
            required=True, kind="formula",
        )
        self._resolved_id_field = self._resolve_field(
            self.config.id_field, field_names, DEFAULT_ID_FIELD_CANDIDATES,
            required=False, kind="id",
        )
        print(
            f"  Rosleshoz: {path.name} "
            f"formula_field={self._resolved_formula_field!r} "
            f"id_field={self._resolved_id_field!r} "
            f"features={info.get('features', '?')}"
        )

        # pyogrio.raw.read() отдаёт (meta, fids, geometry_wkb_array, field_data_list)
        # где field_data_list — список numpy-массивов в том же порядке что meta["fields"].
        # encoding=utf-8 чтобы кириллица не сломалась на Windows.
        meta, _fids, geometry_array, field_data_list = pyogrio.raw.read(
            path,
            layer=self.config.layer,
            bbox=(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat),
            read_geometry=True,
            encoding="utf-8",
        )

        src_crs = meta.get("crs") if isinstance(meta, dict) else None

        # field_data_list — list of numpy arrays в том же порядке что field_names
        field_items: dict[str, Any] = {
            name: field_data_list[j] if j < len(field_data_list) else None
            for j, name in enumerate(field_names)
        }

        n_features = len(geometry_array)
        for i in range(n_features):
            geom_wkb = geometry_array[i]
            if geom_wkb is None:
                continue
            attrs: dict[str, Any] = {
                name: (arr[i] if arr is not None and i < len(arr) else None)
                for name, arr in field_items.items()
            }
            yield RawFeature(
                source_feature_id=self._make_feature_id(attrs, i),
                payload={
                    "geometry_wkb": bytes(geom_wkb),
                    "attrs": attrs,
                    "src_crs": src_crs,
                },
            )

    def normalize(self, raw: RawFeature) -> NormalizedForestPolygon | None:
        attrs: dict[str, Any] = raw.payload["attrs"]
        formula_raw = attrs.get(self._resolved_formula_field) if self._resolved_formula_field else None
        if not formula_raw:
            return None
        formula_str = str(formula_raw).strip()
        if not formula_str:
            return None

        try:
            result = parse_species_formula(formula_str)
        except FormulaParseError:
            return None

        dominant = dominant_slug(result.composition)

        # Геометрия: WKB → Shapely → 4326 (при необходимости)
        from shapely import wkb as shapely_wkb
        try:
            geom = shapely_wkb.loads(raw.payload["geometry_wkb"])
        except Exception:
            return None
        if geom is None or geom.is_empty:
            return None

        src_crs = raw.payload.get("src_crs")
        geom = _to_wgs84(geom, src_crs)
        if geom is None or geom.is_empty:
            return None

        # Приводим к MultiPolygon
        if isinstance(geom, Polygon):
            multi = MultiPolygon([geom])
        elif isinstance(geom, MultiPolygon):
            multi = geom
        else:
            # GeometryCollection / LineString / Point — не наш случай
            return None

        # Фильтр по площади
        area_m2 = _area_m2(multi)
        if area_m2 < self.config.min_polygon_m2:
            return None

        meta_out = {
            "formula": formula_str,
            "rosleshoz_version": self.config.version,
        }
        if result.unmapped:
            meta_out["unmapped_species"] = result.unmapped
        if result.unknown:
            meta_out["unknown_species"] = result.unknown
        if result.trace_fraction:
            meta_out["trace_fraction"] = result.trace_fraction
        if self._resolved_id_field and self._resolved_id_field in attrs:
            meta_out["vydel_id"] = attrs[self._resolved_id_field]

        return NormalizedForestPolygon(
            source=self.source_code,
            source_feature_id=raw.source_feature_id,
            source_version=self.source_version,
            geometry_wkt=multi.wkt,
            dominant_species=dominant,
            species_composition=result.composition,
            canopy_cover=None,
            tree_cover_density=None,
            confidence=self.config.confidence,
            area_m2=round(area_m2, 1),
            meta=meta_out,
        )

    # ─── helpers ───────────────────────────────────────────────────────────

    def _make_feature_id(self, attrs: dict[str, Any], fallback_idx: int) -> str:
        if self._resolved_id_field and (val := attrs.get(self._resolved_id_field)) is not None:
            return f"rosleshoz-{self.config.version}-{val}"
        return f"rosleshoz-{self.config.version}-{fallback_idx}"

    @staticmethod
    def _resolve_field(
        explicit: Optional[str],
        field_names: list[str],
        candidates: tuple[str, ...],
        *,
        required: bool,
        kind: str,
    ) -> Optional[str]:
        """Поиск поля среди атрибутов без учёта регистра."""
        if not field_names:
            if required:
                raise RuntimeError(f"Rosleshoz: в файле нет атрибутов — не могу найти поле {kind}")
            return None
        lower_map = {f.lower(): f for f in field_names}
        if explicit:
            if explicit in field_names:
                return explicit
            if explicit.lower() in lower_map:
                return lower_map[explicit.lower()]
            raise RuntimeError(
                f"Rosleshoz: поле {explicit!r} ({kind}) не найдено. "
                f"Есть: {field_names}"
            )
        for c in candidates:
            if c.lower() in lower_map:
                return lower_map[c.lower()]
        if required:
            raise RuntimeError(
                f"Rosleshoz: не удалось автоопределить поле {kind} среди "
                f"{field_names}. Укажи явно через config."
            )
        return None


def _to_wgs84(geom, src_crs):
    """Перепроецирует shapely-геометрию в EPSG:4326 если нужно."""
    if src_crs is None:
        return geom  # предполагаем, что уже в 4326

    try:
        from pyproj import CRS, Transformer
    except ImportError:
        return geom

    try:
        src = CRS.from_user_input(src_crs)
    except Exception:
        return geom

    if src.to_epsg() == 4326:
        return geom

    try:
        transformer = Transformer.from_crs(src, CRS.from_epsg(4326), always_xy=True).transform
        return shapely_transform(transformer, geom)
    except Exception:
        return geom


def _area_m2(geom) -> float:
    """Площадь геометрии в м² через проекцию EPSG:3035 (LAEA Europe)."""
    try:
        from pyproj import CRS, Transformer
        to_laea = Transformer.from_crs(
            CRS.from_epsg(4326), CRS.from_epsg(3035), always_xy=True
        ).transform
        projected = shapely_transform(to_laea, geom)
        return float(projected.area)
    except Exception:
        # fallback: грубая оценка через геометрическую площадь в градусах
        lat_c = geom.centroid.y
        import math
        deg_m = 111_320.0
        lon_scale = deg_m * abs(math.cos(math.radians(lat_c)))
        return float(geom.area * deg_m * lon_scale)
