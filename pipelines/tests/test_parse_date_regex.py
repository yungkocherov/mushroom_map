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
