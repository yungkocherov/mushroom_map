"""
Матчинг упоминаний топонимов против газеттира в БД.

Используется pipelines/extract_places.py после NER.

Стратегия (по приоритету):
    1. exact    — name_normalized == normalize(mention) (confidence 1.0)
    2. alias    — mention встречается в aliases (confidence 0.95)
    3. trgm     — similarity(name_normalized, mention) >= 0.75 (confidence = similarity)

Disambiguation: если несколько кандидатов — берём самый "популярный"
(gazetteer_entry.popularity DESC, kind='settlement' приоритетнее).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .gazetteer import normalize_name


@dataclass
class GazetteerMatch:
    entry_id: int
    name_ru: str
    kind: str
    lat: float
    lon: float
    admin_area_id: Optional[int]
    confidence: float
    match_type: str   # "exact" | "alias" | "trgm"


# Исключаем слишком общие имена, которые NER извлекает как LOC,
# но матчить их в гaзеттире смысла нет (всегда ложные срабатывания).
STOPWORDS: set[str] = {
    "россия", "рф", "ссср",
    "ленинградская область", "ленобласть", "лен обл", "ленобл",
    "санкт-петербург", "санкт петербург", "спб", "петербург", "питер",
    "москва", "московская область",
    "карелия", "финляндия", "эстония",
    "европа", "сибирь", "урал",
    "лес", "болото", "поле", "река", "озеро", "дача", "деревня",
}

KIND_PRIORITY = {
    "settlement": 5,
    "district":   4,
    "station":    3,
    "tract":      2,
    "lake":       2,
    "river":      1,
    "poi":        1,
}


class GazetteerMatcher:
    """Ищет gazetteer_entry по mention'у в пределах region_id."""

    def __init__(self, conn, region_id: int, trgm_threshold: float = 0.75) -> None:
        self.conn = conn
        self.region_id = region_id
        self.trgm_threshold = trgm_threshold

    def match(self, mention: str) -> Optional[GazetteerMatch]:
        normalized = normalize_name(mention)
        if not normalized or normalized in STOPWORDS or len(normalized) < 3:
            return None

        # 1. exact
        row = self._query_exact(normalized)
        if row:
            return self._row_to_match(row, confidence=1.0, match_type="exact")

        # 2. alias (ILIKE по массиву алиасов)
        row = self._query_alias(mention)
        if row:
            return self._row_to_match(row, confidence=0.95, match_type="alias")

        # 3. trigram similarity
        row, sim = self._query_trgm(normalized)
        if row:
            return self._row_to_match(row, confidence=float(sim), match_type="trgm")

        return None

    # ─── queries ──────────────────────────────────────────────────────────

    def _query_exact(self, normalized: str) -> Optional[tuple]:
        return self.conn.execute(
            """
            SELECT id, name_ru, kind, ST_Y(point) AS lat, ST_X(point) AS lon,
                   admin_area_id, popularity
            FROM gazetteer_entry
            WHERE region_id = %s AND name_normalized = %s
            ORDER BY
                CASE kind
                    WHEN 'settlement' THEN 5 WHEN 'district' THEN 4
                    WHEN 'station' THEN 3 WHEN 'tract' THEN 2
                    WHEN 'lake' THEN 2 WHEN 'river' THEN 1
                    ELSE 0 END DESC,
                popularity DESC
            LIMIT 1
            """,
            (self.region_id, normalized),
        ).fetchone()

    def _query_alias(self, mention: str) -> Optional[tuple]:
        return self.conn.execute(
            """
            SELECT id, name_ru, kind, ST_Y(point) AS lat, ST_X(point) AS lon,
                   admin_area_id, popularity
            FROM gazetteer_entry
            WHERE region_id = %s
              AND EXISTS (
                  SELECT 1 FROM unnest(aliases) AS a
                  WHERE LOWER(a) = LOWER(%s)
              )
            ORDER BY
                CASE kind
                    WHEN 'settlement' THEN 5 WHEN 'district' THEN 4
                    WHEN 'station' THEN 3 WHEN 'tract' THEN 2
                    WHEN 'lake' THEN 2 WHEN 'river' THEN 1
                    ELSE 0 END DESC,
                popularity DESC
            LIMIT 1
            """,
            (self.region_id, mention),
        ).fetchone()

    def _query_trgm(self, normalized: str) -> tuple[Optional[tuple], float]:
        row = self.conn.execute(
            """
            SELECT id, name_ru, kind, ST_Y(point) AS lat, ST_X(point) AS lon,
                   admin_area_id, popularity,
                   similarity(name_normalized, %s) AS sim
            FROM gazetteer_entry
            WHERE region_id = %s
              AND name_normalized %% %s
              AND similarity(name_normalized, %s) >= %s
            ORDER BY
                sim DESC,
                CASE kind
                    WHEN 'settlement' THEN 5 WHEN 'district' THEN 4
                    WHEN 'station' THEN 3 WHEN 'tract' THEN 2
                    WHEN 'lake' THEN 2 WHEN 'river' THEN 1
                    ELSE 0 END DESC,
                popularity DESC
            LIMIT 1
            """,
            (normalized, self.region_id, normalized, normalized, self.trgm_threshold),
        ).fetchone()
        if row is None:
            return None, 0.0
        return row[:7], row[7]

    def _row_to_match(
        self,
        row: tuple,
        *,
        confidence: float,
        match_type: str,
    ) -> GazetteerMatch:
        entry_id, name_ru, kind, lat, lon, admin_area_id, _popularity = row
        return GazetteerMatch(
            entry_id=entry_id,
            name_ru=name_ru,
            kind=kind,
            lat=float(lat),
            lon=float(lon),
            admin_area_id=admin_area_id,
            confidence=confidence,
            match_type=match_type,
        )
