"""
Copernicus HRL Tree Species source.

Это заглушка для phase 2 перехода — вся логика документирована в
docs/copernicus_migration.md. Здесь показано, *как* будет выглядеть
реализация, чтобы убедиться: контракт ForestSource это допускает
без переписывания фронта/БД.

Полный план:
    1. fetch():
         - получить credentials Copernicus Data Space (CDSE)
         - WCS или STAC запрос на Tree Species product по bbox
         - скачать GeoTIFF-тайлы (каждый — один "feature"), стримить
    2. normalize():
         - открыть тайл через rasterio
         - ресэмпл 10→30 м
         - rasterio.features.shapes → полигоны по классам пород
         - для каждого полигона посчитать смесь в буфере 50 м
         - вернуть NormalizedForestPolygon с species_composition,
           dominant_species, confidence=0.9
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Optional

from geodata.sources.base import ForestSource, RawFeature
from geodata.types import BoundingBox, ForestTypeSlug, NormalizedForestPolygon


# Маппинг классов Copernicus HRL Tree Species на наши slug'и.
# Актуальные номера классов проверить в документации продукта перед реализацией.
# См. https://land.copernicus.eu/pan-european/high-resolution-layers/forests
COPERNICUS_CLASS_MAP: dict[int, ForestTypeSlug] = {
    # 1: "beech",   # буки — добавь beech в ForestTypeSlug при необходимости
    # 2: "birch",
    # 3: "alder",
    # 4: "oak",
    # 5: "pine",
    # 6: "spruce",
    # ... (заполнить при реализации)
}


@dataclass
class CopernicusConfig:
    """Настройки Copernicus (заполняются при реализации)."""
    product: str = "HRL_TREE_SPECIES_2018"
    api_url: str = "https://dataspace.copernicus.eu/api"
    credentials_env: str = "COPERNICUS_TOKEN"
    download_dir: str = "data/copernicus"
    min_polygon_m2: float = 2500.0      # 0.25 га
    composition_buffer_m: float = 50.0  # окружение для расчёта смеси


class CopernicusForestSource(ForestSource):
    """
    ЗАГЛУШКА. Phase 2. Реальная реализация — в рамках миграции на точные данные.
    Контракт уже совместим с форматом БД и view forest_unified.
    """
    source_code = "copernicus"

    def __init__(self, config: CopernicusConfig | None = None) -> None:
        self.config = config or CopernicusConfig()

    @property
    def source_version(self) -> str:
        return f"copernicus-{self.config.product.lower()}-v1"

    def fetch(self, bbox: BoundingBox) -> Iterator[RawFeature]:
        raise NotImplementedError(
            "CopernicusForestSource.fetch: phase 2. "
            "Реализация по docs/copernicus_migration.md §3.1"
        )

    def normalize(self, raw: RawFeature) -> Optional[NormalizedForestPolygon]:
        raise NotImplementedError(
            "CopernicusForestSource.normalize: phase 2. "
            "Реализация по docs/copernicus_migration.md §3.2"
        )
