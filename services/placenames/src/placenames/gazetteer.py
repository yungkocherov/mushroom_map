"""
Газеттир: справочник топонимов региона.

Phase 2 задачи:
    1. load_from_osm(region_bbox) — выкачать через Overpass все
       place=* (village, town, hamlet, suburb, locality),
       natural=peak/water/wood (с name), tourism=picnic_site
    2. load_from_yaml(path) — ручные дополнения
       (грибные урочища, озёра, деревни-без-OSM)
    3. normalize(name) — lower + unaccent + убрать лишние кавычки
    4. upsert в gazetteer_entry

Этот модуль — заглушка, контракт описан ниже.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Iterable


@dataclass
class GazetteerEntry:
    name_ru: str
    name_normalized: str
    aliases: list[str]
    kind: str                  # settlement/tract/lake/...
    lat: float
    lon: float
    source: str = "manual"     # "osm" | "manual" | "wikidata"


def normalize_name(name: str) -> str:
    """Каноническая нормализация для матчинга.

    Пример: "Лемболово́" -> "лемболово"
    """
    s = name.strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    # убираем кавычки, лишние пробелы
    s = s.replace("«", "").replace("»", "").replace("'", "").replace('"', "")
    s = " ".join(s.split())
    return s


def load_from_yaml(path: str) -> Iterable[GazetteerEntry]:
    """TODO phase 2: загрузить из YAML с ручными дополнениями."""
    raise NotImplementedError


def load_from_osm(region_code: str) -> Iterable[GazetteerEntry]:
    """TODO phase 2: Overpass запрос по place=* в bbox региона."""
    raise NotImplementedError
