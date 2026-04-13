"""
Natasha-обёртка для NER локаций из русского текста.

Phase 2 план:
    from natasha import (
        Segmenter, MorphVocab, NewsEmbedding, NewsNERTagger, Doc,
    )

    class PlacenameNER:
        def __init__(self):
            self.seg = Segmenter()
            self.emb = NewsEmbedding()
            self.tagger = NewsNERTagger(self.emb)
            self.morph = MorphVocab()

        def extract(self, text: str) -> list[LocationMention]:
            doc = Doc(text)
            doc.segment(self.seg)
            doc.tag_ner(self.tagger)
            out = []
            for span in doc.spans:
                if span.type == "LOC":
                    span.normalize(self.morph)  # "в Лемболове" -> "Лемболово"
                    out.append(LocationMention(
                        surface=span.text,
                        normalized=span.normal,
                        start=span.start,
                        stop=span.stop,
                    ))
            return out
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LocationMention:
    surface: str        # как в тексте: "в Лемболово"
    normalized: str     # начальная форма: "Лемболово"
    start: int
    stop: int


class PlacenameNER:
    """TODO phase 2: инициализация Natasha + extract()."""

    def extract(self, text: str) -> list[LocationMention]:
        raise NotImplementedError("PlacenameNER.extract: phase 2 (Natasha)")
