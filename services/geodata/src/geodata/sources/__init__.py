"""Источники лесных данных. Общий контракт — ForestSource."""

from geodata.sources.base import ForestSource, RawFeature
from geodata.sources.copernicus import CopernicusForestSource
from geodata.sources.osm import OSMForestSource
from geodata.sources.terranorte import TerraNorteForestSource

__all__ = [
    "ForestSource",
    "RawFeature",
    "OSMForestSource",
    "CopernicusForestSource",
    "TerraNorteForestSource",
]


def get_source(name: str) -> type[ForestSource]:
    """Фабрика источников по имени. Добавляй сюда новые реализации."""
    registry: dict[str, type[ForestSource]] = {
        "osm": OSMForestSource,
        "copernicus": CopernicusForestSource,
        "terranorte": TerraNorteForestSource,
    }
    if name not in registry:
        raise ValueError(f"Unknown forest source: {name!r}. Available: {list(registry)}")
    return registry[name]
