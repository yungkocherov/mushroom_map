"""
Тесты для parse_species_formula и species_label_to_slug.

Это самая важная тестируемая логика в geodata-сервисе: от неё зависит
породная раскраска всех лесных полигонов. Багт здесь → неправильный цвет
сосны/ели/берёзы на всей карте и неправильные теоретические виды в попапе.

Тесты — чисто функциональные, без БД, сети и файлов.
"""

from __future__ import annotations

import pytest

from geodata.sources.rosleshoz.formula import (
    FormulaParseError,
    TRACE_FRACTION,
    dominant_slug,
    parse_species_formula,
    species_label_to_slug,
)


# ─── species_label_to_slug (plain labels от ФГИС ЛК) ─────────────────────────


class TestSpeciesLabelToSlug:
    def test_spruce_short(self) -> None:
        assert species_label_to_slug("Ель") == "spruce"

    def test_spruce_full(self) -> None:
        assert species_label_to_slug("Ель европейская") == "spruce"

    def test_case_insensitive(self) -> None:
        assert species_label_to_slug("ЕЛЬ") == "spruce"
        assert species_label_to_slug("ель") == "spruce"

    def test_yo_normalization(self) -> None:
        """ё ↔ е должно работать."""
        assert species_label_to_slug("Берёза") == "birch"
        assert species_label_to_slug("Береза") == "birch"

    def test_parens_stripping(self) -> None:
        assert species_label_to_slug("Ольха серая (белая)") == "alder"
        assert species_label_to_slug("Ольха серая") == "alder"

    def test_prefix_match(self) -> None:
        """'Берёза повислая' маппится через префикс 'берёза'."""
        assert species_label_to_slug("Берёза повислая") == "birch"
        assert species_label_to_slug("Ольха чёрная") == "alder"

    def test_whitespace(self) -> None:
        assert species_label_to_slug("  Сосна  ") == "pine"
        assert species_label_to_slug("Ель\tобыкновенная") == "spruce"

    def test_empty(self) -> None:
        assert species_label_to_slug("") is None
        assert species_label_to_slug("   ") is None

    def test_unknown_species(self) -> None:
        """Вид не из нашего словаря → None, не исключение."""
        assert species_label_to_slug("Секвойя") is None
        assert species_label_to_slug("Эвкалипт") is None

    def test_main_tree_species(self) -> None:
        """Sanity check для всех основных видов."""
        cases = {
            "Сосна":        "pine",
            "Ель":          "spruce",
            "Лиственница":  "larch",
            "Пихта":        "fir",
            "Кедр":         "cedar",
            "Берёза":       "birch",
            "Осина":        "aspen",
            "Ольха":        "alder",
            "Дуб":          "oak",
            "Липа":         "linden",
            "Клён":         "maple",
        }
        for label, expected in cases.items():
            assert species_label_to_slug(label) == expected, f"{label!r} → {expected}"


# ─── parse_species_formula (6Е3С1Б нотация) ──────────────────────────────────


class TestParseFormula:
    def test_monoculture(self) -> None:
        """'10Е' → 100% ели."""
        r = parse_species_formula("10Е")
        assert r.composition == {"spruce": 1.0}
        assert r.unmapped == []
        assert r.unknown == []

    def test_three_species(self) -> None:
        """'6Е3С1Б' → 60% ель, 30% сосна, 10% берёза."""
        r = parse_species_formula("6Е3С1Б")
        assert r.composition == pytest.approx({"spruce": 0.6, "pine": 0.3, "birch": 0.1})
        assert r.unmapped == []

    def test_case_variations(self) -> None:
        """Нижний регистр и ё должны работать."""
        r1 = parse_species_formula("6Е3С1Б")
        r2 = parse_species_formula("6е3с1б")
        r3 = parse_species_formula("6Ё3С1Б")  # ё (ёлка) иногда встречается
        assert r1.composition == r2.composition == r3.composition

    def test_whitespace(self) -> None:
        r = parse_species_formula("6Е 3С 1Б")
        assert r.composition == pytest.approx({"spruce": 0.6, "pine": 0.3, "birch": 0.1})

    def test_plus_trace(self) -> None:
        """'8Е2Б+Ос' — осина как trace-примесь, не в основной сумме."""
        r = parse_species_formula("8Е2Б+Ос")
        assert r.composition["spruce"] == pytest.approx(0.8 * (1 - TRACE_FRACTION), abs=0.01)
        assert r.composition["birch"]  == pytest.approx(0.2 * (1 - TRACE_FRACTION), abs=0.01)
        assert r.composition["aspen"]  == pytest.approx(TRACE_FRACTION, abs=0.01)
        assert r.trace_fraction > 0

    def test_ed_trace(self) -> None:
        """'5Е4С1Б ед.Ол' — 'единично.Ольха' как trace."""
        r = parse_species_formula("5Е4С1Б ед.Ол")
        assert "alder" in r.composition
        assert r.composition["alder"] == pytest.approx(TRACE_FRACTION, abs=0.01)
        assert r.composition["spruce"] > 0.4

    def test_composition_sums_to_one(self) -> None:
        """Инвариант: сумма долей должна быть ~1.0 (±5%)."""
        for formula in ["10Е", "6Е3С1Б", "4Е3С2Б1Ос", "8Е2Б+Ос", "5Е4С1Б ед.Ол"]:
            r = parse_species_formula(formula)
            total = sum(r.composition.values())
            assert 0.95 <= total <= 1.05, f"{formula!r}: total={total}"

    def test_empty_raises(self) -> None:
        with pytest.raises(FormulaParseError):
            parse_species_formula("")
        with pytest.raises(FormulaParseError):
            parse_species_formula("   ")

    def test_plain_label_fallback(self) -> None:
        """Если нет цифр — это plain label (ФГИС ЛК style)."""
        r = parse_species_formula("Ель")
        assert r.composition == {"spruce": 1.0}

    def test_unknown_species_goes_to_unmapped(self) -> None:
        """Ива/ясень парсятся, но попадают в unmapped (нет slug'а)."""
        r = parse_species_formula("7Е2Б1Ив")
        # spruce + birch в композиции, ива — в unmapped
        assert "spruce" in r.composition
        assert "birch" in r.composition
        assert len(r.unmapped) > 0

    def test_partial_nonsense(self) -> None:
        """'6XYZ3С1Б' — 'XYZ' не распознаётся, но сосна+берёза должны попасть."""
        r = parse_species_formula("6XYZ3С1Б")
        # Минимум одна порода должна быть извлечена
        assert r.composition  # не пустой


# ─── dominant_slug ───────────────────────────────────────────────────────────


class TestDominantSlug:
    def test_obvious_winner(self) -> None:
        assert dominant_slug({"spruce": 0.8, "pine": 0.2}) == "spruce"

    def test_tie(self) -> None:
        """При точном равенстве возвращается любой из них (детерминированно)."""
        result = dominant_slug({"spruce": 0.5, "pine": 0.5})
        assert result in ("spruce", "pine")

    def test_empty_returns_unknown(self) -> None:
        assert dominant_slug({}) == "unknown"

    def test_single_species(self) -> None:
        assert dominant_slug({"birch": 1.0}) == "birch"
