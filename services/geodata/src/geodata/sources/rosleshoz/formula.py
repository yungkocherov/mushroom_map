"""
Парсер «формулы породного состава» — компактной нотации,
которая используется в таксационных описаниях лесов России.

Примеры:
    "10Е"           → {"spruce": 1.0}
    "6Е3С1Б"        → {"spruce": 0.6, "pine": 0.3, "birch": 0.1}
    "8Е2Б+Ос"       → {"spruce": 0.8, "birch": 0.2, "aspen": trace}
    "5Е4С1Б ед.Ол"  → {"spruce": 0.5, "pine": 0.4, "birch": 0.1, "alder": trace}

Правила:
    • Формула разбивается на «части», каждая = digit(s) + species_abbr.
    • Сумма цифр = 10 (100%).
    • "+SPECIES" или "ед.SPECIES" означает «примесь меньше единицы»
      (trace, по умолчанию TRACE_FRACTION ≈ 0.02) и в общую сумму НЕ
      входит — настоящие проценты нормализуются отдельно.
    • Буквы — русские (иногда строчные). Код терпим к пробелам,
      смешению регистров и лишним точкам.

Возвращаемый формат: ``dict[str, float]`` где ключи — наши slug'и
из ``geodata.types.ForestTypeSlug``, значения — доли в [0, 1],
сумма ≈ 1.0 (нормализована).

Есть **непокрытые виды** (ива, тополь, граб, ясень и др.) — у нас нет
соответствующих slug'ов. Мы их парсим, но выкидываем и ремарно
ремаркой в ``parse_result.unmapped`` оставляем для отладки.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final

from geodata.types import FOREST_TYPE_SLUGS, ForestTypeSlug

# ─── Маппинг русских сокращений → наш slug ────────────────────────────────────
#
# Ключи — **нормализованные** (lower, без точек) сокращения, как они
# встречаются в таксационных описаниях. Источники:
#   - Приказ Рослесхоза №126 от 09.04.2015 (лесохозяйственный регламент)
#   - ГОСТ 18486-87 «Лесоводство. Термины и определения»
#   - Методические указания по устройству лесов в России
#
# Если сокращение отсутствует — вид уходит в unmapped (не теряется,
# лишь не участвует в композиции).

SPECIES_ABBR_TO_SLUG: Final[dict[str, ForestTypeSlug]] = {
    # Хвойные
    "е":    "spruce",       # ель (Picea abies)
    "ель":  "spruce",
    "п":    "fir",          # пихта (Abies)
    "пх":   "fir",
    "пихта": "fir",
    "с":    "pine",         # сосна (Pinus sylvestris)
    "сос":  "pine",
    "сосна": "pine",
    "к":    "cedar",        # кедр (Pinus sibirica = сосна сибирская)
    "кс":   "cedar",
    "кдр":  "cedar",
    "кедр": "cedar",
    "л":    "larch",        # лиственница (Larix)
    "лц":   "larch",
    "листв": "larch",
    "лиственница": "larch",

    # Мелколиственные
    "б":    "birch",        # берёза (Betula)
    "бер":  "birch",
    "берёза": "birch",
    "береза": "birch",
    "ос":   "aspen",        # осина (Populus tremula)
    "осина": "aspen",
    "ол":   "alder",        # ольха (Alnus) — обычно серая/чёрная
    "олс":  "alder",        # ольха серая
    "олч":  "alder",        # ольха чёрная
    "ольха": "alder",
    "ольха серая": "alder",
    "ольха серая (белая)": "alder",
    "ольха черная": "alder",
    "ольха чёрная": "alder",

    # Широколиственные
    "д":    "oak",          # дуб (Quercus)
    "дуб":  "oak",
    "лп":   "linden",       # липа (Tilia)
    "липа": "linden",
    "кл":   "maple",        # клён (Acer)
    "клён": "maple",
    "клен": "maple",
}


def species_label_to_slug(label: str) -> ForestTypeSlug | None:
    """Нормализует русскую метку породы ("Ель", "Ольха серая (белая)") в slug.

    Используется для файлов, где у выдела записана только доминирующая
    порода одним словом (ФГИС ЛК TAXATION_PIECE.tree_species), без
    полноценной формулы типа «6Е3С1Б».
    """
    if not label:
        return None
    norm = " ".join(label.strip().lower().replace("ё", "е").split())
    if norm in SPECIES_ABBR_TO_SLUG:
        return SPECIES_ABBR_TO_SLUG[norm]
    # убираем уточнения в скобках: "ольха серая (белая)" -> "ольха серая"
    no_parens = " ".join(
        word for word in norm.replace("(", " ").replace(")", " ").split()
    )
    if no_parens in SPECIES_ABBR_TO_SLUG:
        return SPECIES_ABBR_TO_SLUG[no_parens]
    # префикс-матч: "берёза повислая" -> "береза"
    tokens = norm.split()
    for i in range(len(tokens), 0, -1):
        prefix = " ".join(tokens[:i])
        if prefix in SPECIES_ABBR_TO_SLUG:
            return SPECIES_ABBR_TO_SLUG[prefix]
    return None

# Дополнительные виды, которые парсим, но у нас нет slug'а — они уходят в
# unmapped и не считаются в композиции. Перечислены чтобы отличать «неизвестное
# сокращение» от «известное, но не маппится».
KNOWN_UNMAPPED_SPECIES: Final[frozenset[str]] = frozenset({
    "ив", "ива",        # ива (Salix)
    "яс", "ясень",      # ясень (Fraxinus)
    "вз", "вяз",        # вяз (Ulmus)
    "т", "тт", "тополь",  # тополь (Populus)
    "г", "граб",        # граб (Carpinus)
    "бк", "бук",        # бук (Fagus)
    "яб", "ябл", "яблоня",  # яблоня
    "гр", "груш", "груша",  # груша
    "р", "ряб", "рябина",   # рябина
    "черемуха", "чрм",  # черёмуха
})

#: Доля для trace-видов («+Ос» или «ед.Б») — символическое значение.
#: Делится между всеми trace-видами пропорционально после основной композиции.
TRACE_FRACTION: Final[float] = 0.02


# ─── Парсинг ──────────────────────────────────────────────────────────────────

class FormulaParseError(ValueError):
    """Поднимается когда формула не парсится вообще."""


@dataclass
class FormulaParseResult:
    #: Композиция по нашим slug'ам, сумма ≈ 1.0
    composition: dict[str, float]
    #: Виды, распознанные по словарю, но без slug'а (например, «ива»)
    unmapped: list[str] = field(default_factory=list)
    #: Неопознанные фрагменты (например, опечатки, мусор)
    unknown: list[str] = field(default_factory=list)
    #: Доля, признанная trace (примеси «+» и «ед.»)
    trace_fraction: float = 0.0
    #: Сырая формула, как она была дана
    raw: str = ""


# Основное сокращение: 1-2 цифры + 1-5 букв. Допускаем латиницу, чтобы
# ловить OCR-мусор и отправлять его в `unknown`, а не молча игнорировать.
_MAIN_RE = re.compile(r"(\d{1,2})\s*([а-яёА-ЯЁa-zA-Z]{1,5})")

# Примеси: «+Ос», «+Б» — после «+» идёт код вида
_PLUS_TRACE_RE = re.compile(r"\+\s*([а-яёА-ЯЁa-zA-Z]{1,5})")

# «ед.» — единично. Может быть «ед.», «ед ».
_ED_TRACE_RE = re.compile(r"ед[.\s]+([а-яёА-ЯЁa-zA-Z]{1,5})")


def _normalize_abbr(abbr: str) -> str:
    """Нижний регистр, убираем точки, заменяем ё→е для устойчивости."""
    return abbr.strip().lower().replace("ё", "е").rstrip(".")


def _map_species(abbr: str) -> tuple[ForestTypeSlug | None, bool]:
    """
    Возвращает (slug, is_known_unmapped).

    - (slug, False)   — известное сокращение, есть наш slug.
    - (None, True)    — известное, но у нас нет slug'а (ива, бук и т.п.)
    - (None, False)   — вообще не узнано.
    """
    key = _normalize_abbr(abbr)
    # Замена ё уже в _normalize_abbr; в словаре тоже храним через "е".
    # Проверим точное совпадение, потом префиксное (на 2 символа).
    if key in SPECIES_ABBR_TO_SLUG:
        return SPECIES_ABBR_TO_SLUG[key], False
    # Префиксные варианты для более длинных записей (например, "бер.")
    for k, v in SPECIES_ABBR_TO_SLUG.items():
        if len(k) >= 2 and (key.startswith(k) or k.startswith(key)):
            # доп. защита: совпадение должно быть полным словом,
            # а не случайным префиксом "с" ("сос" матчит "с")
            if key == k or key[: len(k)] == k:
                return v, False
    if key in KNOWN_UNMAPPED_SPECIES:
        return None, True
    for kno in KNOWN_UNMAPPED_SPECIES:
        if len(kno) >= 2 and key.startswith(kno):
            return None, True
    return None, False


def parse_species_formula(formula: str) -> FormulaParseResult:
    """
    Парсит таксационную формулу в композицию по slug'ам.

    Поддерживает два формата:
      1. «6Е3С1Б» (классический таксационный)
      2. «Ель» / «Ольха серая (белая)» (plain label, ФГИС ЛК)

    Raises:
        FormulaParseError — если метка совсем не распозналась и мы не
            можем вернуть даже одной породы.
    """
    raw = formula or ""
    text = raw.strip()
    if not text:
        raise FormulaParseError("пустая формула")

    # Быстрый путь: plain label (без цифр) — одно слово / словосочетание
    if not any(ch.isdigit() for ch in text):
        slug = species_label_to_slug(text)
        if slug is not None:
            return FormulaParseResult(
                composition={slug: 1.0},
                unmapped=[],
                unknown=[],
                trace_fraction=0.0,
                raw=raw,
            )
        raise FormulaParseError(f"plain label {raw!r} не маппится в slug")

    # сведение дубликатов пробелов; NB: не трогаем регистр, он нужен для регексов
    text_norm = re.sub(r"\s+", " ", text)

    # 1. Найти все trace-примеси («+X», «ед.X») и удалить их из основной строки
    #    чтобы они не мешали _MAIN_RE
    trace_species: list[str] = []

    def _collect_trace(match: re.Match) -> str:
        trace_species.append(match.group(1))
        return " "

    # "ед." сначала: длиннее, иначе "ед" могло бы подхватиться как порода (е+д)
    text_main = _ED_TRACE_RE.sub(_collect_trace, text_norm)
    text_main = _PLUS_TRACE_RE.sub(_collect_trace, text_main)

    # 2. Основные части — digit+species
    raw_parts: list[tuple[int, str]] = []
    for m in _MAIN_RE.finditer(text_main):
        units = int(m.group(1))
        abbr = m.group(2)
        raw_parts.append((units, abbr))

    if not raw_parts and not trace_species:
        raise FormulaParseError(f"не распознано ни одной породы: {raw!r}")

    # 3. Смаппить основные части
    unmapped: list[str] = []
    unknown: list[str] = []
    composition_units: dict[str, float] = {}

    for units, abbr in raw_parts:
        slug, known_unmapped = _map_species(abbr)
        abbr_norm = _normalize_abbr(abbr)
        if slug is not None:
            composition_units[slug] = composition_units.get(slug, 0.0) + units
        elif known_unmapped:
            unmapped.append(abbr_norm)
        else:
            unknown.append(abbr_norm)

    # 4. Trace-виды → trace_composition (trace_fraction делится поровну)
    trace_composition: dict[str, float] = {}
    trace_unmapped: list[str] = []
    trace_unknown: list[str] = []
    for abbr in trace_species:
        slug, known_unmapped = _map_species(abbr)
        abbr_norm = _normalize_abbr(abbr)
        if slug is not None:
            trace_composition[slug] = trace_composition.get(slug, 0.0) + 1.0
        elif known_unmapped:
            trace_unmapped.append(abbr_norm)
        else:
            trace_unknown.append(abbr_norm)

    unmapped.extend(trace_unmapped)
    unknown.extend(trace_unknown)

    # 5. Нормализация: основные в (1 - trace_fraction), trace — в trace_fraction
    main_sum = sum(composition_units.values())
    if main_sum == 0 and not trace_composition:
        raise FormulaParseError(
            f"{raw!r}: все распознанные породы не маппятся в наши slug'и"
        )

    trace_total = TRACE_FRACTION if trace_composition else 0.0
    main_total = 1.0 - trace_total if main_sum > 0 else 0.0

    composition: dict[str, float] = {}
    if main_sum > 0:
        for slug, units in composition_units.items():
            composition[slug] = (units / main_sum) * main_total

    if trace_composition:
        t_sum = sum(trace_composition.values())
        for slug, units in trace_composition.items():
            composition[slug] = composition.get(slug, 0.0) + (units / t_sum) * trace_total

    # 6. Финальная защита: сумма должна быть ≈ 1.0
    total = sum(composition.values())
    if total <= 0:
        raise FormulaParseError(f"{raw!r}: итоговая композиция пустая")
    if abs(total - 1.0) > 1e-6:
        composition = {k: v / total for k, v in composition.items()}

    # округление для читаемости (не ломает требование сумма ≈ 1)
    composition = {k: round(v, 4) for k, v in composition.items()}
    # пост-коррекция округления
    s = sum(composition.values())
    if s > 0 and abs(s - 1.0) > 1e-3:
        # редкая ситуация — поправим первый попавшийся slug
        first = next(iter(composition))
        composition[first] += 1.0 - s
        composition[first] = round(composition[first], 4)

    for slug in composition:
        if slug not in FOREST_TYPE_SLUGS:
            raise FormulaParseError(f"внутренняя ошибка: slug {slug!r} не из каноники")

    return FormulaParseResult(
        composition=composition,
        unmapped=unmapped,
        unknown=unknown,
        trace_fraction=trace_total,
        raw=raw,
    )


def dominant_slug(composition: dict[str, float]) -> ForestTypeSlug:
    """Доминирующий вид по максимальной доле.

    Если composition пустая — возвращает ``"unknown"``.
    """
    if not composition:
        return "unknown"
    return max(composition.items(), key=lambda kv: kv[1])[0]  # type: ignore[return-value]
