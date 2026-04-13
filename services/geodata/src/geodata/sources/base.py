"""
Абстракция источника лесных данных.

ForestSource — стратегия (Strategy pattern), которая инкапсулирует
*откуда* берутся данные и *как* они нормализуются в единый формат.

Все источники пишут в общую таблицу `forest_polygon` с колонкой `source`.
View `forest_unified` приоритезирует лучший источник — см. db/migrations/004_forest.sql
и docs/copernicus_migration.md.

Правило расширения: новый источник = новый файл sources/<name>.py +
регистрация в sources/__init__.py. Схему БД трогать НЕ надо.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Iterator

from geodata.types import BoundingBox, NormalizedForestPolygon


@dataclass
class RawFeature:
    """
    Сырая запись от источника до нормализации.

    `payload` — произвольная структура: GeoJSON feature, кортеж raster+metadata,
    распарсенный XML-элемент. Источник сам знает, что с ней делать в normalize().
    """
    source_feature_id: str
    payload: Any


class ForestSource(ABC):
    """
    Контракт источника лесных данных.

    Использование:
        source = OSMForestSource(config)
        for raw in source.fetch(bbox):
            poly = source.normalize(raw)
            if poly is not None:
                db.insert(poly)
    """

    #: slug источника — должен совпадать с forest_source.code в БД
    source_code: str

    #: версия датасета. Может быть динамической (дата скачивания) или статической (версия продукта)
    @property
    @abstractmethod
    def source_version(self) -> str: ...

    @abstractmethod
    def fetch(self, bbox: BoundingBox) -> Iterator[RawFeature]:
        """
        Скачивает сырые лесные данные в пределах bbox.

        Возвращает итератор (стриминг), чтобы не грузить всё в память.
        Сеть/диск вызываются внутри — метод может быть долгим.
        """
        ...

    @abstractmethod
    def normalize(self, raw: RawFeature) -> NormalizedForestPolygon | None:
        """
        Превращает сырую фичу в NormalizedForestPolygon.

        Возвращает None, если фича должна быть отброшена
        (например, полигон слишком мелкий или тип леса не определяется).

        Правило: normalize() не должен делать сетевых запросов —
        только чистая трансформация payload'а.
        """
        ...

    def fetch_normalized(self, bbox: BoundingBox) -> Iterator[NormalizedForestPolygon]:
        """Удобный helper: fetch + normalize подряд, None'ы отфильтрованы."""
        for raw in self.fetch(bbox):
            poly = self.normalize(raw)
            if poly is not None:
                yield poly
