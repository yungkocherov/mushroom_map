"""
Natasha-обёртка для NER локаций из русского текста VK-постов.

Использование:
    ner = PlacenameNER()
    mentions = ner.extract("Ездили в субботу в Лемболово, набрали белых")
    for m in mentions:
        print(m.surface, "->", m.normalized)
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from natasha import (
    Doc,
    MorphVocab,
    NewsEmbedding,
    NewsNERTagger,
    Segmenter,
)


@dataclass
class LocationMention:
    surface: str        # как в тексте: "в Лемболово"
    normalized: str     # начальная форма: "лемболово"
    start: int
    stop: int


class PlacenameNER:
    """Извлекает LOC-спаны из русского текста и нормализует их.

    Тяжёлые модели Natasha инициализируются один раз при первом вызове.
    """

    def __init__(self) -> None:
        self._segmenter = Segmenter()
        self._emb = NewsEmbedding()
        self._ner_tagger = NewsNERTagger(self._emb)
        self._morph = MorphVocab()

    def extract(self, text: str) -> list[LocationMention]:
        if not text or not text.strip():
            return []

        doc = Doc(text)
        doc.segment(self._segmenter)
        doc.tag_ner(self._ner_tagger)

        out: list[LocationMention] = []
        for span in doc.spans:
            if span.type != "LOC":
                continue
            span.normalize(self._morph)
            normal = (span.normal or span.text).strip().lower()
            if not normal:
                continue
            out.append(
                LocationMention(
                    surface=span.text,
                    normalized=normal,
                    start=span.start,
                    stop=span.stop,
                )
            )
        return out


@lru_cache(maxsize=1)
def get_default_ner() -> PlacenameNER:
    """Singleton для тяжёлых моделей Natasha."""
    return PlacenameNER()
