"""Общие типы для geodata-сервиса."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

# Канонические slug'и пород деревьев.
# Синхронизированы со species_forest_affinity.forest_type в БД.
# Правило: slug'и добавляются, но НЕ переименовываются и НЕ удаляются.
ForestTypeSlug = Literal[
    "pine",
    "spruce",
    "larch",
    "fir",
    "cedar",
    "birch",
    "aspen",
    "alder",
    "oak",
    "linden",
    "maple",
    "mixed_coniferous",
    "mixed_broadleaved",
    "mixed",
    "unknown",
]

FOREST_TYPE_SLUGS: tuple[ForestTypeSlug, ...] = (
    "pine", "spruce", "larch", "fir", "cedar",
    "birch", "aspen", "alder", "oak", "linden", "maple",
    "mixed_coniferous", "mixed_broadleaved", "mixed", "unknown",
)


@dataclass(frozen=True)
class BoundingBox:
    """Географический bbox в WGS84."""
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.min_lon, self.min_lat, self.max_lon, self.max_lat)

    def overpass_bbox(self) -> str:
        """Формат (south,west,north,east) как требует Overpass."""
        return f"{self.min_lat},{self.min_lon},{self.max_lat},{self.max_lon}"


@dataclass
class NormalizedForestPolygon:
    """
    Унифицированное представление лесного полигона, независимо от источника.

    Это выходной формат ForestSource.normalize() и входной формат для БД.
    """
    source: str                                 # 'osm' | 'copernicus' | 'rosleshoz'
    source_feature_id: str                      # id в исходной системе
    source_version: str                         # версия датасета
    geometry_wkt: str                            # WKT геометрии (MULTIPOLYGON, EPSG:4326)
    dominant_species: ForestTypeSlug
    species_composition: Optional[dict[str, float]] = None   # {"pine":0.6,"spruce":0.3,...} или None
    canopy_cover: Optional[float] = None        # 0..1
    tree_cover_density: Optional[float] = None  # 0..1
    confidence: float = 0.5                     # 0..1, надёжность классификации
    area_m2: Optional[float] = None             # если посчитан заранее
    meta: dict = field(default_factory=dict)    # произвольные поля от источника

    def __post_init__(self) -> None:
        if self.dominant_species not in FOREST_TYPE_SLUGS:
            raise ValueError(
                f"dominant_species={self.dominant_species!r} не из канонических slug'ов. "
                f"Допустимы: {FOREST_TYPE_SLUGS}"
            )
        if self.species_composition:
            total = sum(self.species_composition.values())
            if not 0.95 <= total <= 1.05:
                raise ValueError(
                    f"species_composition должен суммироваться в ~1.0, получили {total}"
                )
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence должен быть в [0,1], получили {self.confidence}")
