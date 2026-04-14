"""
Rosleshoz / ФГИС ЛК — официальный лесной кадастр России.

Уровень 3 в иерархии источников (см. docs/forest_sources_analysis.md):
реальный породный состав выделов в виде формулы "6Е3С1Б" → конкретные
проценты видов в каждом выделе.

Подмодули:
    formula   — парсер «формулы породного состава»
    source    — RosleshozForestSource, читает локальные векторные файлы
                (GeoJSON/Shapefile/GPKG/FlatGeobuf) с атрибутом-формулой
                и выдаёт NormalizedForestPolygon
"""

from geodata.sources.rosleshoz.formula import (
    SPECIES_ABBR_TO_SLUG,
    FormulaParseError,
    parse_species_formula,
)
from geodata.sources.rosleshoz.source import (
    RosleshozConfig,
    RosleshozForestSource,
)

__all__ = [
    "SPECIES_ABBR_TO_SLUG",
    "FormulaParseError",
    "parse_species_formula",
    "RosleshozConfig",
    "RosleshozForestSource",
]
