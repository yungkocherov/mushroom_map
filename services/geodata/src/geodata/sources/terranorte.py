"""
TerraNorte RLC (Russia Land Cover) forest source.

Продукт Института космических исследований РАН (ИКИ РАН), группа Барталёва.
Научная классификация лесов **специально для территории России** на основе
временных рядов MODIS Terra/Aqua. Разрешение 230 м, ежегодные обновления.

Зачем он нам
------------
Copernicus HRL заканчивается на границе EEA39 — Ленобласть, Карелия,
вся остальная Россия вне покрытия. TerraNorte закрывает эту дыру и даёт
более детальные классы, чем глобальные продукты (CGLS-LC100, ESA CCI):
тёмнохвойные vs светлохвойные отличаются, мелколиственные отдельно от
широколиственных. Подробный анализ — в ``docs/forest_sources_analysis.md``.

Как это сделано
---------------
`CopernicusForestSource` уже был написан универсальным — он читает любой
GeoTIFF с классификацией и применяет `class_map`. TerraNorteForestSource —
тонкий subclass, который переопределяет:

    source_code     = "terranorte"
    default config  = класс-маппинг под TerraNorte RLC + другой download_dir

Вся остальная логика (векторизация, буфер для смеси, репроецирование
в EPSG:4326, фильтр площади) наследуется без изменений.

Маппинг классов
---------------
Приведённый ниже `DEFAULT_TERRANORTE_CLASS_MAP` — **best guess** на основе
публикаций группы Барталёва (RSE 2014, 2016). Точные коды в конкретной
поставке могут отличаться: всегда сверяй с метаданными GeoTIFF или
описанием на http://terranorte.iki.rssi.ru/.

Пользователь может передать свой маппинг через YAML:

    python pipelines/ingest_forest.py --source terranorte --region lenoblast \\
        --copernicus-class-map data/terranorte/class_map.yaml

(Флаг называется ``--copernicus-class-map`` потому что мы переиспользуем
код ingest_forest, где этот флаг работает для любого raster source.)
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from geodata.sources.copernicus import CopernicusConfig, CopernicusForestSource
from geodata.types import ForestTypeSlug


# ─── Best guess маппинг TerraNorte RLC → наш словарь пород ────────────────────
#
# Источники для guess:
#   - Bartalev et al. (2011) "A new SPOT4-VEGETATION derived land cover map
#     of Northern Eurasia" — 23-class legend
#   - Bartalev et al. (2014) RSE
#   - TerraNorte RLC legend (по состоянию на публикации группы)
#
# Типичная 23-классовая легенда TerraNorte RLC (классы могут меняться
# между версиями продукта — ВСЕГДА сверяй с актуальным PUM):
#   1  - Evergreen dark needleleaf forest (ель, пихта, кедр) → spruce/fir/cedar
#   2  - Evergreen light needleleaf forest (сосна)           → pine
#   3  - Deciduous needleleaf forest (лиственница)           → larch
#   4  - Mixed forest (хвойные + широколиственные)           → mixed
#   5  - Deciduous broadleaf forest (дуб, бук, клён)         → oak (грубо)
#   6  - Small-leaved deciduous forest (берёза, осина)       → birch (грубо)
#   7  - Open forest / лесотундра                            → mixed_coniferous
#   8  - Shrubs
#   9  - Shrub tundra
#   10 - Tundra
#   11 - Wetland
#   12 - Sparse vegetation / steppe
#   13 - Grassland
#   14 - Cropland
#   15 - Water
#   16 - Bare
#   17 - Urban
#   18 - Snow/Ice
#   ...
#
# Маппим только лесные классы (1-7). Остальное отбрасывается.

DEFAULT_TERRANORTE_CLASS_MAP: dict[int, ForestTypeSlug] = {
    1: "spruce",                    # тёмнохвойные (ель/пихта) — основной представитель
    2: "pine",                      # светлохвойные вечнозелёные (сосна)
    3: "larch",                     # светлохвойные листопадные (лиственница)
    4: "mixed",                     # смешанный
    5: "oak",                       # широколиственные (грубо — берём доминанту Ленобласти)
    6: "birch",                     # мелколиственные (грубо — берёза как самый частый)
    7: "mixed_coniferous",          # редколесье (чаще хвойное в Ленобласти)
}


class TerraNorteForestSource(CopernicusForestSource):
    """
    TerraNorte RLC — научный продукт ИКИ РАН, покрывает всю Россию.

    Наследник CopernicusForestSource: переиспользует весь растровый
    pipeline (fetch/normalize/vectorize/buffer-composition/reproject),
    меняет только source_code и дефолтный config.
    """

    source_code = "terranorte"

    def __init__(self, config: CopernicusConfig | None = None) -> None:
        if config is None:
            config = CopernicusConfig(
                download_dir=Path("data/terranorte"),
                class_map=dict(DEFAULT_TERRANORTE_CLASS_MAP),
                product="iki-rlc",
                # У TerraNorte свой TCD-подобный слой (fractional cover)
                # не применяем
                tcd_dir=None,
                # TerraNorte 230 м — повышаем порог площади, чтобы не плодить
                # «по-пиксельные» лоскуты
                min_polygon_m2=50_000.0,       # 5 га
                composition_buffer_m=500.0,    # 2 пикселя для смеси на 230 м
            )
        super().__init__(config)
