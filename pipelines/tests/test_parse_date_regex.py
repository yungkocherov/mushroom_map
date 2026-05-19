"""
Unit tests for `pipelines/ingest_vk.py::parse_date_regex`.

Reggression coverage for the «месяц YYYY» bug (2026-05-15):

  Старый regex `{MONTHS_RU}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?` на тексте
  "сентябрь 2020 г" greedy-захватывал "20" как DD и подставлял
  post_dt.year как fallback year — давал date(post_year, 9, 20)
  вместо date(2020, 9, ~15). Fix: `(?!\\d)` после `\\d{1,2}` блокирует
  совпадение когда последующие символы цифра (то есть DD на самом деле
  начало YYYY).
"""

from __future__ import annotations

import random
from datetime import date

import pytest

from ingest_vk import parse_date_regex


@pytest.fixture(autouse=True)
def _seed_random():
    """parse_date_regex использует random.randint для "месяц YYYY без дня"
    case. Фиксируем seed чтобы тесты были детерминистичны."""
    random.seed(0)
    yield


# ════════════════════════════════════════════════════════════════════════
#  BUG REGRESSION: «месяц YYYY» с цифрой года, ошибочно парсимой как DD
# ════════════════════════════════════════════════════════════════════════

def test_month_year_format_does_not_steal_year_digits_as_day():
    """«сентябрь 2020 г» при post в 2022 → должна быть September 2020,
    не September 2022 (20 ≠ день)."""
    result = parse_date_regex("Приозерский район, сентябрь 2020 г", date(2022, 8, 15))
    assert result is not None
    assert result.year == 2020
    assert result.month == 9
    assert 10 <= result.day <= 25  # random day из [10, 25]


def test_month_year_no_space_before_g():
    """«июнь 2023г» (без пробела перед "г") при post 2023+."""
    result = parse_date_regex("Всеволожский район, июнь 2023г", date(2023, 8, 15))
    assert result is not None
    assert result.year == 2023
    assert result.month == 6


def test_month_year_august_2021():
    """«август 2021 г» при post в 2022."""
    result = parse_date_regex("Всеволожский район, август 2021 г", date(2022, 11, 5))
    assert result is not None
    assert result.year == 2021
    assert result.month == 8


def test_year_only_no_month_returns_none():
    """«Вспоминая 2021 год... Алёховщина. Лодейнопольский район» —
    год есть, день/месяц нет → нельзя надёжно извлечь, None."""
    result = parse_date_regex(
        "Вспоминая 2021 год... Алёховщина. Лодейнопольский район",
        date(2023, 9, 10),
    )
    assert result is None


# ════════════════════════════════════════════════════════════════════════
#  HAPPY PATH: формы что должны продолжать работать после fix
# ════════════════════════════════════════════════════════════════════════

def test_dd_month_yyyy_with_g_suffix():
    """«30 августа 2021г» — explicit DD месяц YYYY."""
    result = parse_date_regex("30 августа 2021г", date(2022, 5, 1))
    assert result == date(2021, 8, 30)


def test_dd_month_yyyy_with_goda_suffix():
    """«3 сентября 2021 года» — full form."""
    result = parse_date_regex("3 сентября 2021 года", date(2022, 5, 1))
    assert result == date(2021, 9, 3)


def test_month_yyyy_only():
    """«октябрь 2023» — month + year, no day."""
    result = parse_date_regex("октябрь 2023", date(2024, 1, 1))
    assert result is not None
    assert result.year == 2023
    assert result.month == 10
    assert 10 <= result.day <= 25


def test_dot_separated_full_date():
    """«01.09.2020» — DD.MM.YYYY."""
    result = parse_date_regex("01.09.2020", date(2022, 5, 1))
    assert result == date(2020, 9, 1)


def test_slash_separated_full_date():
    """«01/09/2020» — DD/MM/YYYY (тот же regex)."""
    result = parse_date_regex("01/09/2020", date(2022, 5, 1))
    assert result == date(2020, 9, 1)


def test_month_dd_fallback_to_post_year():
    """«сентябрь 20» (legit Sep 20-го числа, year inferred) —
    должен fallback на post_dt.year. Это критично проверить, чтобы
    `(?!\\d)` не сломал legitimate цифры."""
    result = parse_date_regex("сентябрь 20", date(2022, 9, 25))
    assert result == date(2022, 9, 20)


def test_text_with_no_date_returns_none():
    """«грибы в августе» — month без года и без дня → None
    (не должно подставляться random)."""
    result = parse_date_regex("грибы в августе", date(2022, 9, 1))
    assert result is None


# ════════════════════════════════════════════════════════════════════════
#  YEAR ROLLBACK: дата выходит в будущее → откатить год на -1
# ════════════════════════════════════════════════════════════════════════

def test_year_rollback_dd_month_no_year():
    """«20 сентября» при post 2022-05-01: September 20, 2022 > post →
    откат на 2021-09-20."""
    result = parse_date_regex("20 сентября", date(2022, 5, 1))
    assert result == date(2021, 9, 20)


# ════════════════════════════════════════════════════════════════════════
#  EDGE: months with "месяц-месяц YYYY" range — текущее поведение
#  захватывает второй месяц + год (best-effort, не идеально)
# ════════════════════════════════════════════════════════════════════════

def test_month_range_picks_last_month():
    """«сентябрь-октябрь 2020» — захват `октябрь 2020` через line 386
    (best-effort, не возвращаем None)."""
    result = parse_date_regex("сентябрь-октябрь 2020", date(2022, 5, 1))
    assert result is not None
    assert result.year == 2020
    assert result.month == 10


def test_same_month_as_post_clips_random_day():
    """«сентябрь 2024» при post 2024-09-05 → день не должен превысить
    post.day = 5 (иначе impossible_future). Regression: до day-clip fix
    line 386 random.randint(10, 25) давал foray > post."""
    result = parse_date_regex("сентябрь 2024", date(2024, 9, 5))
    assert result is not None
    assert result.year == 2024
    assert result.month == 9
    assert 1 <= result.day <= 5


# ════════════════════════════════════════════════════════════════════════
#  BUG REGRESSION: дробь/диапазон ошибочно парсится как «DD.MM без года»
#
#  Старый bare-branch `\b(\d{1,2})[./\\](\d{1,2})\b` матчил дроби и
#  диапазоны, которыми кишат грибные посты: "2/3 червивые" → 2 марта,
#  "1\2 корзины" → 1 февраля, "1/3 от найденного" → 1 марта, "1-2 часа"
#  → 1 февраля. Это (а) инъецировало ложные зимние/апрельские даты и
#  (б) затеняло реальную дату ("DD месяц") позже в том же посте, т.к.
#  bare-branch срабатывает раньше. Все 56 deep-winter артефактов
#  летне-осенних видов (2018-25) — отсюда. Прямые id из корпуса в
#  docstring каждого кейса. Fix: bare-no-year branch принимает только
#  `.` как separator (`/`,`\` = дробь; `-` = диапазон/счёт; реальные
#  bare-даты в RU-грибокорпусе — точечные "06.02"). Slash/`-`-даты С
#  годом ловятся раньше через DD.MM.YYYY branch (там class неизменён).
# ════════════════════════════════════════════════════════════════════════

def test_slash_fraction_not_parsed_as_date():
    """id 63835: «Из 30 белых - 2/3 червивые, а вот красные(67 штук)».
    "2/3" НЕ должно стать 2019-03-02 (нет другой даты → None)."""
    result = parse_date_regex(
        "Заходское, после дождичка. Из 30 белых - 2/3 червивые, "
        "а вот красные(67 штук), почти все хорошие.",
        date(2019, 9, 5),
    )
    assert result is None


def test_backslash_fraction_not_parsed_as_date():
    """id 65622: «...1\\2 корзины лисичек». "1\\2" НЕ → 2019-02-01."""
    result = parse_date_regex(
        "Приозерский р-он - Вернулась из леса. 6 боровичков, "
        "3 подберезовика и 1\\2 корзины лисичек...",
        date(2019, 7, 20),
    )
    assert result is None


def test_slash_fraction_one_third_not_parsed_as_date():
    """id 4527: «...оставили 1/3 от найденого». "1/3" НЕ → 2025-03-01."""
    result = parse_date_regex(
        "Гдовский район, немного красненьких, все чистые, "
        "оставили 1/3 от найденого.",
        date(2025, 8, 18),
    )
    assert result is None


def test_fraction_does_not_shadow_real_dd_month_date():
    """Двойной ущерб: «27 июля ... за 1-2 часа ... 1/2 ведра» (post
    2024-07-27). Раньше bare-branch на "1/2"/"1-2" побеждал и давал
    Feb 1, затеняя реальное «27 июля». После fix — корректный
    2024-07-27 через DD-месяц branch."""
    result = parse_date_regex(
        "27 июля, Ропша. Прекрасный сухой лес, грибов много. "
        "Всего 3,5 кг за 1-2 часа, набрал 1/2 ведра.",
        date(2024, 7, 27),
    )
    assert result == date(2024, 7, 27)


def test_bare_dotted_dd_mm_still_works():
    """Regression: точечная bare-дата «06.02» (RU date-form) должна
    продолжать работать."""
    result = parse_date_regex("Тосненский район 06.02, грибов мало",
                              date(2022, 9, 6))
    assert result == date(2022, 2, 6)


def test_real_bare_slash_date_preserved():
    """id 24370/68617: «Рощино 23/08» / «27/08. Воскресенье» — слэш
    ЯВЛЯЕТСЯ распространённым date-separator в этом корпусе (60 реальных
    дат в collateral-harness). Fraction-guard НЕ должен их убивать."""
    assert parse_date_regex("Рощино 23/08 еловые рыжики",
                            date(2018, 9, 1)) == date(2018, 8, 23)
    assert parse_date_regex("27/08. Воскресенье. Приозерский район",
                            date(2023, 9, 5)) == date(2023, 8, 27)


def test_real_bare_slash_date_day_first_single_digit():
    """id 68296: «4/09 Рощино лес рыжики» — одноцифровой день, слэш,
    без года. Реальная дата, сохранить."""
    assert parse_date_regex("4/09 Рощино лес, рыжики",
                            date(2018, 9, 10)) == date(2018, 9, 4)


def test_slash_fraction_chervivyh_core_noun():
    """id 53338: «1/3 червивых» — core fraction-noun сразу следом.
    Не должно стать 2020-03-01 (нет др. даты → None)."""
    result = parse_date_regex(
        "Из 30 белых 1/3 червивых, остальное оставил в лесу.",
        date(2020, 8, 10),
    )
    assert result is None


def test_harvest_volume_after_real_date_not_fraction():
    """id 4522/13831: «18.08 15 литров», «06.08 2 баночки» — harvest-
    объём после реальной даты НЕ дробь. Дата должна сохраниться."""
    assert parse_date_regex("Вырица. 18.08 15 литров за 4 часа.",
                            date(2025, 8, 18)) == date(2025, 8, 18)
    assert parse_date_regex("Агалатово 06.08. Червивость 70%",
                            date(2024, 8, 6)) == date(2024, 8, 6)
