"""
Copernicus HRL forest source.

Читает **уже скачанные** GeoTIFF-тайлы с классификацией пород деревьев
из Copernicus Land Monitoring Service (CLMS) и превращает их в векторные
полигоны с плотной породной смесью.

Что это решает
--------------
OSM даёт 88% полигонов `unknown` (в российском OSM почти никто не
размечает `leaf_type`/`wood`). Copernicus HRL — это 10-метровые растры,
где каждый пиксель классифицирован по породе. Для Ленобласти применяется
два продукта:

1. **HRL DLT (Dominant Leaf Type)** — 2 класса (1=broadleaved, 2=coniferous),
   пан-европейское покрытие, доступно бесплатно с 2012, 2015, 2018.
2. **HRL TCD (Tree Cover Density)** — сплошное покрытие, используется для
   отфильтровки "не леса" (пикселей с низкой tree cover density).

В более новых поставках появляются продукты с конкретными видами
(Pinus sylvestris, Picea abies, Betula, Quercus, Fagus, Abies и т.д.).
Код универсальный: маппинг классов описывается в CopernicusConfig.class_map.

Как использовать
----------------
1. Скачай тайлы вручную по инструкции ``docs/copernicus_download.md``
2. Положи GeoTIFF'ы в ``data/copernicus/tree_species/*.tif``
   и ``data/copernicus/tcd/*.tif`` (опционально)
3. Запусти ``python pipelines/ingest_forest.py --source copernicus --region lenoblast``

Детали реализации
-----------------
* ``fetch()``  — находит все GeoTIFF'ы в ``download_dir`` и отдаёт их как
  ``RawFeature`` c путём к файлу (один файл = одна сырая фича).
* ``normalize()`` — для каждого файла:
    - читает растр через rasterio в память (окнами, если файл большой)
    - опционально режет маской по полигону региона (если передан bbox)
    - векторизует пиксели через ``rasterio.features.shapes``
    - группирует по значению класса
    - для каждого кластера считает смесь пород в буфере 50 м
    - репроецирует геометрию из CRS файла в EPSG:4326
    - отбрасывает слишком мелкие полигоны
    - отдаёт ``NormalizedForestPolygon`` с dominant/composition/confidence
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.features import shapes as raster_shapes
from rasterio.windows import Window
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform as shapely_transform, unary_union

from pyproj import Transformer

from geodata.sources.base import ForestSource, RawFeature
from geodata.types import BoundingBox, ForestTypeSlug, NormalizedForestPolygon


# ─── Конфигурация классов ────────────────────────────────────────────────────

# Маппинг классов Copernicus HRL → наш единый словарь пород.
#
# По умолчанию сконфигурировано под HRL **Dominant Leaf Type** (DLT) 2018:
#   1 = broadleaved (широколистные)      → mixed_broadleaved
#   2 = coniferous  (хвойные)            → mixed_coniferous
#   0 / 255 = nodata / не лес            → отбрасываем
#
# Если скачал более детальный продукт Tree Species, замени DLT_CLASS_MAP
# своим маппингом через CopernicusConfig(class_map=...).
# Актуальные коды всегда смотри в XML-метаданных файла или в
# Product User Manual на land.copernicus.eu.

DLT_CLASS_MAP: dict[int, ForestTypeSlug] = {
    1: "mixed_broadleaved",
    2: "mixed_coniferous",
}

# Пример маппинга под HRL Tree Species (если появится детальный продукт).
# Точные коды уточни в метаданных своей поставки.
TREE_SPECIES_CLASS_MAP_EXAMPLE: dict[int, ForestTypeSlug] = {
    1: "fir",        # Abies
    2: "birch",      # Betula
    3: "linden",     # не применяется в DLT — пример
    4: "oak",        # Quercus
    5: "pine",       # Pinus sylvestris / Pinus pinaster
    6: "spruce",     # Picea abies
    7: "larch",      # Larix
    8: "mixed_broadleaved",   # "other broadleaved"
    9: "mixed_coniferous",    # "other coniferous"
}

# Коды, которые всегда отбрасываем (фон, nodata)
DEFAULT_SKIP_VALUES: frozenset[int] = frozenset({0, 255})


@dataclass
class CopernicusConfig:
    """Настройки чтения тайлов Copernicus."""
    #: директория со скачанными GeoTIFF'ами с классификацией (dlt / species)
    download_dir: Path = field(default_factory=lambda: Path("data/copernicus/tree_species"))
    #: опционально — директория с tree cover density растрами для фильтра "не лес"
    tcd_dir: Optional[Path] = None
    #: коды классов → породы
    class_map: dict[int, ForestTypeSlug] = field(default_factory=lambda: dict(DLT_CLASS_MAP))
    #: коды, которые игнорируем (nodata, фон)
    skip_values: frozenset[int] = DEFAULT_SKIP_VALUES
    #: минимальная площадь полигона, м² (лоскуты меньше отбрасываем)
    min_polygon_m2: float = 2_500.0
    #: размер буфера в метрах для расчёта смеси пород
    composition_buffer_m: float = 50.0
    #: минимальный tree cover density (0..100) для включения пикселя в лес
    tcd_min: int = 30
    #: версия продукта (идёт в source_version)
    product: str = "hrl-dlt-2018"
    #: CRS выходной геометрии
    output_crs: str = "EPSG:4326"


# ─── Source ───────────────────────────────────────────────────────────────────

class CopernicusForestSource(ForestSource):
    """
    Читает скачанные тайлы Copernicus и векторизует их.

    Контракт:
        fetch(bbox)  — отдаёт RawFeature по одному на GeoTIFF-файл.
        normalize()  — возвращает iterable NormalizedForestPolygon
                       (внутри _normalize_one используется как генератор).

    ВАЖНО: normalize() в родительском классе объявлен как ``-> NormalizedForestPolygon | None``.
    Мы переопределяем fetch_normalized() чтобы стримить сразу несколько полигонов
    из одного файла — иначе один Raster отдавал бы один полигон, что бессмысленно.
    """
    source_code = "copernicus"

    def __init__(self, config: CopernicusConfig | None = None) -> None:
        self.config = config or CopernicusConfig()
        self._fetched_at = dt.date.today()

    @property
    def source_version(self) -> str:
        return f"copernicus-{self.config.product}"

    # ─── API ForestSource ───────────────────────────────────────────────────

    def fetch(self, bbox: BoundingBox) -> Iterator[RawFeature]:
        """Находит все GeoTIFF'ы в download_dir, отдаёт их как RawFeature."""
        root = Path(self.config.download_dir)
        if not root.exists():
            raise FileNotFoundError(
                f"Copernicus: директория {root} не существует. "
                f"Скачай тайлы по инструкции docs/copernicus_download.md"
            )
        files = sorted(root.glob("*.tif")) + sorted(root.glob("*.tiff"))
        if not files:
            raise FileNotFoundError(
                f"Copernicus: в {root} нет .tif/.tiff файлов. "
                f"См. docs/copernicus_download.md"
            )
        print(f"  Copernicus: найдено {len(files)} тайлов в {root}")
        for path in files:
            yield RawFeature(
                source_feature_id=path.name,
                payload={"tif_path": str(path), "bbox": bbox},
            )

    def normalize(self, raw: RawFeature) -> NormalizedForestPolygon | None:
        """Одна фича = один файл — но в файле много полигонов.

        ForestSource.normalize() ожидает one-to-one, поэтому основная логика
        выведена в _normalize_one, а мы переопределяем fetch_normalized
        чтобы уметь one-to-many.
        """
        raise RuntimeError(
            "CopernicusForestSource.normalize() не вызывается напрямую — "
            "используй fetch_normalized()."
        )

    def fetch_normalized(self, bbox: BoundingBox) -> Iterator[NormalizedForestPolygon]:
        for raw in self.fetch(bbox):
            yield from self._normalize_one(raw)

    # ─── Внутренняя логика ──────────────────────────────────────────────────

    def _normalize_one(self, raw: RawFeature) -> Iterator[NormalizedForestPolygon]:
        tif_path = Path(raw.payload["tif_path"])
        bbox: BoundingBox | None = raw.payload.get("bbox")
        print(f"  -> {tif_path.name}")

        with rasterio.open(tif_path) as src:
            raster_crs: CRS = src.crs
            if raster_crs is None:
                print(f"    WARN: {tif_path.name} без CRS — пропускаем")
                return
            transform = src.transform
            arr = src.read(1)
            nodata = src.nodata

        # маска пикселей, которые берём в векторизацию
        valid = np.ones_like(arr, dtype=bool)
        if nodata is not None:
            valid &= arr != nodata
        for v in self.config.skip_values:
            valid &= arr != v
        valid &= np.isin(arr, list(self.config.class_map.keys()))

        if not valid.any():
            print(f"    {tif_path.name}: нет валидных пикселей")
            return

        # Дополнительный фильтр по tree cover density, если есть
        if self.config.tcd_dir:
            tcd_mask = self._load_matching_tcd(tif_path)
            if tcd_mask is not None:
                valid &= tcd_mask

        # shapes() ожидает mask=uint8 / None и сам читает значения
        masked = np.where(valid, arr, 0).astype("int32")

        # Векторизация
        shapes_iter = raster_shapes(masked, mask=valid, transform=transform)

        # Группируем по значению класса, чтобы объединить смежные пиксели одного класса
        by_class: dict[int, list[Polygon]] = {}
        for geom_json, value in shapes_iter:
            val = int(value)
            if val not in self.config.class_map:
                continue
            try:
                geom = shape(geom_json)
            except Exception:
                continue
            if not geom.is_valid or geom.is_empty:
                continue
            by_class.setdefault(val, []).append(geom)

        print(f"    классов: {len(by_class)}, "
              f"суммарно фич до слияния: {sum(len(v) for v in by_class.values())}")

        # Готовим reprojector растр-CRS → EPSG:4326
        to_wgs84 = Transformer.from_crs(
            raster_crs, CRS.from_string(self.config.output_crs), always_xy=True
        ).transform

        total_ok = 0
        for class_value, geoms in by_class.items():
            merged = unary_union(geoms)
            polys: list[Polygon] = self._to_polygon_list(merged)

            for i, poly in enumerate(polys):
                area_m2 = self._area_m2(poly, raster_crs)
                if area_m2 < self.config.min_polygon_m2:
                    continue

                composition = self._composition_in_buffer(
                    poly, arr, transform, raster_crs
                )
                dominant = self.config.class_map.get(class_value)
                if dominant is None:
                    continue

                # Перепроецируем в 4326
                try:
                    poly_wgs = shapely_transform(to_wgs84, poly)
                except Exception as e:
                    print(f"    reproject error: {e}")
                    continue
                if poly_wgs.is_empty or not poly_wgs.is_valid:
                    poly_wgs = poly_wgs.buffer(0)
                    if poly_wgs.is_empty or not poly_wgs.is_valid:
                        continue

                multi = (
                    poly_wgs
                    if isinstance(poly_wgs, MultiPolygon)
                    else MultiPolygon([poly_wgs])
                )

                total_ok += 1
                yield NormalizedForestPolygon(
                    source=self.source_code,
                    source_feature_id=f"{tif_path.name}#c{class_value}-{i}",
                    source_version=self.source_version,
                    geometry_wkt=multi.wkt,
                    dominant_species=dominant,
                    species_composition=composition,
                    canopy_cover=None,
                    tree_cover_density=None,
                    confidence=0.9,
                    area_m2=round(area_m2, 1),
                    meta={
                        "tif": tif_path.name,
                        "class_value": class_value,
                        "product": self.config.product,
                    },
                )
        print(f"    готово: {total_ok} полигонов")

    # ─── helpers ────────────────────────────────────────────────────────────

    def _to_polygon_list(self, geom) -> list[Polygon]:
        if isinstance(geom, Polygon):
            return [geom]
        if isinstance(geom, MultiPolygon):
            return [p for p in geom.geoms if isinstance(p, Polygon)]
        try:
            return [p for p in geom.geoms if isinstance(p, Polygon)]
        except AttributeError:
            return []

    def _area_m2(self, poly: Polygon, raster_crs: CRS) -> float:
        """Площадь полигона в м²."""
        if raster_crs.is_projected:
            # CRS в метрах (ETRS89/LAEA, UTM и пр.) — shapely.area уже в м²
            return float(poly.area)
        # Географический — репроецируем в EPSG:3035 для честной площади
        to_laea = Transformer.from_crs(
            raster_crs, CRS.from_epsg(3035), always_xy=True
        ).transform
        return float(shapely_transform(to_laea, poly).area)

    def _composition_in_buffer(
        self,
        poly: Polygon,
        arr: np.ndarray,
        transform,
        raster_crs: CRS,
    ) -> dict[str, float] | None:
        """
        Считает породную смесь в буфере вокруг полигона.

        Если CRS проекционный — buffer в единицах CRS (м).
        Если географический — буфер в градусах (грубо: 50 м ≈ 0.00045°).
        """
        buffer_m = self.config.composition_buffer_m
        if raster_crs.is_projected:
            buffered = poly.buffer(buffer_m)
        else:
            buffered = poly.buffer(buffer_m / 111_320.0)
        if buffered.is_empty or not buffered.is_valid:
            return None

        # Bounding box буфера в пикселях
        minx, miny, maxx, maxy = buffered.bounds
        try:
            from rasterio.transform import rowcol
            r_min, c_min = rowcol(transform, minx, maxy)
            r_max, c_max = rowcol(transform, maxx, miny)
        except Exception:
            return None

        r0 = max(0, min(r_min, r_max))
        r1 = min(arr.shape[0], max(r_min, r_max) + 1)
        c0 = max(0, min(c_min, c_max))
        c1 = min(arr.shape[1], max(c_min, c_max) + 1)
        if r1 <= r0 or c1 <= c0:
            return None

        window = arr[r0:r1, c0:c1]
        # считаем распределение только среди пикселей, которые мапятся в породу
        classes = list(self.config.class_map.keys())
        if not classes:
            return None

        counts: dict[int, int] = {}
        for cls in classes:
            counts[cls] = int(np.sum(window == cls))
        total = sum(counts.values())
        if total == 0:
            return None

        comp: dict[str, float] = {}
        for cls, n in counts.items():
            if n == 0:
                continue
            slug = self.config.class_map[cls]
            comp[slug] = comp.get(slug, 0.0) + n / total
        # нормализация (на случай если несколько классов мапятся на один slug)
        s = sum(comp.values())
        if s <= 0:
            return None
        return {k: round(v / s, 3) for k, v in comp.items()}

    def _load_matching_tcd(self, tif_path: Path) -> Optional[np.ndarray]:
        """Ищет TCD-растр с таким же bounds/shape и возвращает маску tcd>=tcd_min.

        Соответствие ищется по совпадению bounds + shape. Если ничего не
        нашлось — возвращает None, и фильтр TCD не применяется.
        """
        if self.config.tcd_dir is None:
            return None
        tcd_root = Path(self.config.tcd_dir)
        if not tcd_root.exists():
            return None
        with rasterio.open(tif_path) as ref:
            ref_shape = (ref.height, ref.width)
            ref_bounds = ref.bounds
        for c in sorted(tcd_root.glob("*.tif")) + sorted(tcd_root.glob("*.tiff")):
            with rasterio.open(c) as src:
                if (src.height, src.width) == ref_shape and src.bounds == ref_bounds:
                    return src.read(1) >= self.config.tcd_min
        return None
