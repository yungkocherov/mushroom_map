"""
regex_district_check: регулярки для определения района ЛО из VK-поста.

Зачем: Natasha-пайплайн (extract_vk_districts.py) размечает только ~8% постов
(5628 / 69k). Пользователь видит, что районов в группе «Грибы Санкт-Петербурга»
реально упомянуто намного больше. Гипотеза: NER теряет случаи, которые
regex-подход с лексемами района + города-донора легко ловит.

Скрипт:
  1. --frequency: распечатывает топ слов на «-ский/-ская/-ское/-скому/…» и
     списки часто встречающихся Заглавных-токенов. Помогает проверить, что
     список регулярок покрывает реальный текст.
  2. --check (дефолт): прогон regex-словаря по vk_post.text. Считает
     assigned / ambiguous / no_match и сравнивает с district_admin_area_id
     от Natasha — сколько совпало, где разошлось.
  3. --write: записать результат в vk_post.district_admin_area_id
     для постов, у которых Natasha вернула NULL и regex нашёл
     **ровно один** район (без конфликтов). Не перезатирает существующие
     Natasha-матчи. Помечает source через place_match.meta.

Usage:
  python scripts/regex_district_check.py --frequency --limit 5000
  python scripts/regex_district_check.py --check
  python scripts/regex_district_check.py --check --write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import psycopg

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "pipelines"))
from db_utils import build_dsn  # noqa: E402


# ─── Регулярки по 18 районам ЛО ──────────────────────────────────────────────
#
# Две группы паттернов на район:
#   A. Прилагательное района: «Выборгский», «в Выборгском районе», и т.д.
#      Ловится через корень + \w* (все падежи).
#   B. Топонимы-доноры: города, посёлки, озёра, «грибные места», однозначно
#      находящиеся в этом районе. Осторожно со словами-ловушками:
#      - «Киров» может быть городом в Кировской области → добавляем
#        «кировск» (узкая форма Кировска ЛО)
#      - «Ломоносов» — ФИО; нужен контекст (посёлок Ломоносов, Ломоносовский р-н)
#      - «Луга» — женский род, конфликт с лужами/лугами. Даём только формы
#        «в Лугах», «из Луги», «Лужск*»
#
# re.IGNORECASE включён глобально. \b по краям — чтобы не ловить подстроки.

DISTRICT_PATTERNS: dict[str, list[str]] = {
    "Бокситогорский район": [
        r"\bбокситогорск\w*",
        r"\bпикал[её]в\w*",
    ],
    "Волосовский район": [
        r"\bволосовск\w*",
        r"\bволосов[оае]?\b",      # посёлок Волосово
        r"\bбегуниц\w*",
    ],
    "Волховский район": [
        r"\bволховск\w*",
        r"\bволхов\w*",             # и город, и река
        r"\bновая\s+ладога\b",
        r"\bсясьстрой\w*",
    ],
    "Всеволожский район": [
        r"\bвсеволожск\w*",
        r"\bлемболов\w*",           # Лемболово
        r"\bтоксов\w*",
        r"\bкавголов\w*",
        r"\bмурин\w*",
        r"\bколтуш\w*",
        r"\bоржицы\b",
        r"\bсертолов\w*",
        r"\bромашк\w+\s+оз",        # Ромашки оз.
    ],
    "Выборгский район": [
        r"\bвыборгск\w*",
        r"\bвыборг[аеу]?\b",        # сам Выборг
        r"\bрощин\w*",
        r"\bзеленогорск\w*",
        r"\bкирилловск\w*",
        r"\bзаходское\b",
        r"\bпервомайск\w*",         # пос. Первомайское
    ],
    "Гатчинский муниципальный округ": [
        r"\bгатчинск\w*",
        r"\bгатчин[ае]?\b",
        r"\bвырицк?\w*",
        r"\bсиверск\w*",
        r"\bкоммунарск?\w*",
        r"\bверевск\w*",
        r"\bорлин\w*",
        r"\bдружн\w*\s+г",          # Дружная горка
    ],
    "Кингисеппский район": [
        r"\bкингисепп?ск\w*",
        r"\bкингисепп?\b",
        r"\bивангород\w*",
        r"\bусть[- ]лу\w*",         # Усть-Луга
    ],
    "Киришский район": [
        r"\bкиришск\w*",
        r"\bкириш[аеуи]?\b",
    ],
    "Кировский район": [
        r"\bкировск\w*\s+р",        # «Кировский район»
        r"\bкировск\b",             # Кировск-город
        r"\bмга\b",                 # ж/д станция Мга
        r"\bшлиссельбург\w*",
        r"\bпутилов\w*",
        r"\bсинявин\w*",
        r"\bназия\b",
    ],
    "Лодейнопольский район": [
        r"\bлодейнопол\w*",
        r"\bлодейное\s+поле\b",
        r"\bсвирьстрой\w*",
        r"\bяндеб\w*",
    ],
    "Ломоносовский район": [
        r"\bломоносовск\w*",
        r"\bнизин\w*",              # Низино
        r"\bлопухинк\w*",
        r"\bгостилицк?\w*",
        r"\bбольшая\s+ижор\w*",
        r"\bкопорск?\w*",           # Копорье
    ],
    "Лужский район": [
        r"\bлужск\w*",
        r"\b(?:в|из|под)\s+лу[ге]\w*",  # в Луге, из Луги, под Лугой
        r"\bтолмачев\w*",
        r"\bмшинск\w*",
        r"\bоредеж\w*",
    ],
    "Подпорожский район": [
        r"\bподпорожск\w*",
        r"\bподпорож[аеу]?\b",
        r"\bвознесен\w*\s+пос",
    ],
    "Приозерский район": [
        r"\bприозерск\w*",
        r"\bлосев\w*",               # Лосево
        r"\bорехов\w*",              # Орехово
        r"\bсосново\b",
        r"\bпетяярв\w*",
        r"\bгромов\w*",              # Громово
        r"\bкузнечн\w*",
        r"\bпятиречь\w*",
    ],
    "Сланцевский район": [
        r"\bсланцевск\w*",
        r"\bсланц[ыи]\b",
    ],
    "Сосновоборский городской округ": [
        r"\bсосновоборск\w*",
        r"\bсосновый\s+бор\b",
    ],
    "Тихвинский район": [
        r"\bтихвинск\w*",
        r"\bтихвин[аеу]?\b",
    ],
    "Тосненский район": [
        r"\bтосненск\w*",
        r"\bтосн[оае]\b",            # Тосно
        r"\bлюбан\w*",
        r"\bульяновк\w*",
        r"\bфорносов\w*",
    ],
}

# Компилируем с re.IGNORECASE один раз
COMPILED: dict[str, list[re.Pattern]] = {
    name: [re.compile(p, re.IGNORECASE) for p in patterns]
    for name, patterns in DISTRICT_PATTERNS.items()
}


# ─── frequency analysis ──────────────────────────────────────────────────────

# Кириллические слова длиной >=4
TOKEN_RE = re.compile(r"\b[А-Яа-яЁё][а-яё]{3,}\b")
# Слова на «-ский/-ская/-ское/-ским/-ской/-скому/-ском» (прилагательные)
ADJ_SUFFIX_RE = re.compile(r"^[а-яё]+ск(?:ий|ого|ому|им|ом|ая|ой|ую|ое|ие|их|ими|им)$", re.IGNORECASE)


def frequency_mode(conn, limit: int | None) -> None:
    limit_sql = f" LIMIT {int(limit)}" if limit else ""
    rows = conn.execute(f"SELECT text FROM vk_post WHERE text <> ''{limit_sql}").fetchall()
    print(f"scanning {len(rows)} posts...")

    adj_counter: Counter[str] = Counter()
    cap_counter: Counter[str] = Counter()   # Заглавные-токены (собственные имена)

    for (text,) in rows:
        for m in TOKEN_RE.finditer(text or ""):
            tok = m.group(0)
            lower = tok.lower()
            if ADJ_SUFFIX_RE.match(lower):
                adj_counter[lower] += 1
            if tok[0].isupper():
                cap_counter[lower] += 1

    print("\n== top-50 «ский»-прилагательных ==")
    for w, n in adj_counter.most_common(50):
        print(f"  {w:30s} {n}")

    print("\n== top-60 заглавных токенов ==")
    for w, n in cap_counter.most_common(60):
        print(f"  {w:30s} {n}")


# ─── check mode ──────────────────────────────────────────────────────────────

def match_districts(text: str) -> set[str]:
    if not text:
        return set()
    hits: set[str] = set()
    for name, patterns in COMPILED.items():
        for rx in patterns:
            if rx.search(text):
                hits.add(name)
                break
    return hits


def check_mode(conn, limit: int | None, write: bool) -> None:
    limit_sql = f" LIMIT {int(limit)}" if limit else ""
    rows = conn.execute(
        f"""
        SELECT p.id, p.text, p.district_admin_area_id, a.name_ru
        FROM vk_post p
        LEFT JOIN admin_area a ON a.id = p.district_admin_area_id
        WHERE p.text <> ''
        {limit_sql}
        """
    ).fetchall()
    print(f"scanning {len(rows)} posts...")

    id_by_name = dict(
        conn.execute(
            "SELECT name_ru, id FROM admin_area WHERE region_id = 1 AND level = 6"
        ).fetchall()
    )
    missing = [n for n in DISTRICT_PATTERNS if n not in id_by_name]
    if missing:
        print(f"WARN: admin_area не содержит: {missing}")

    regex_assigned = 0
    regex_ambiguous = 0
    regex_none = 0
    regex_by_district: Counter[str] = Counter()

    both_same = 0
    both_differ = 0
    only_regex = 0
    only_natasha = 0
    disagreements: list[tuple[int, str, str, str]] = []   # post_id, natasha, regex_list, text_preview
    write_candidates: list[tuple[int, int]] = []           # (post_id, new_district_id)

    for post_id, text, natasha_id, natasha_name in rows:
        hits = match_districts(text)

        if len(hits) == 0:
            regex_none += 1
        elif len(hits) == 1:
            regex_assigned += 1
            only_name = next(iter(hits))
            regex_by_district[only_name] += 1
        else:
            regex_ambiguous += 1

        # Сравнение с Natasha
        if natasha_name is None and len(hits) == 1:
            only_regex += 1
            aid = id_by_name.get(next(iter(hits)))
            if aid is not None:
                write_candidates.append((post_id, aid))
        elif natasha_name is not None and len(hits) == 0:
            only_natasha += 1
        elif natasha_name is not None and len(hits) >= 1:
            if natasha_name in hits:
                both_same += 1
            else:
                both_differ += 1
                if len(disagreements) < 10:
                    preview = (text[:140] or "").replace("\n", " ")
                    disagreements.append((post_id, natasha_name, "|".join(sorted(hits)), preview))

    total = len(rows)
    print(f"\n== regex stats ==")
    print(f"  total                {total}")
    print(f"  assigned (unique)    {regex_assigned}  ({regex_assigned/total*100:.1f}%)")
    print(f"  ambiguous (>1)       {regex_ambiguous} ({regex_ambiguous/total*100:.1f}%)")
    print(f"  no match             {regex_none}      ({regex_none/total*100:.1f}%)")

    print(f"\n== regex vs natasha ==")
    print(f"  both agree           {both_same}")
    print(f"  both differ          {both_differ}")
    print(f"  only regex           {only_regex}")
    print(f"  only natasha         {only_natasha}")

    print(f"\n== top regex-districts ==")
    for name, n in regex_by_district.most_common():
        print(f"  {name:40s} {n}")

    if disagreements:
        print(f"\n== sample disagreements (natasha != regex) ==")
        for pid, nat, rg, preview in disagreements:
            print(f"  post {pid}: natasha={nat}, regex={rg}")
            print(f"    text: {preview}")

    if write:
        if not write_candidates:
            print("\n(nothing to write)")
            return
        print(f"\n== writing {len(write_candidates)} regex-only matches to vk_post ==")
        with conn.transaction():
            for post_id, aid in write_candidates:
                conn.execute(
                    """
                    UPDATE vk_post
                    SET district_admin_area_id = %s,
                        district_confidence    = 0.80,
                        place_extracted_at     = COALESCE(place_extracted_at, now()),
                        place_match            = COALESCE(place_match, '{}'::jsonb)
                                                 || jsonb_build_object(
                                                     'regex_source', 'regex_district_check',
                                                     'regex_confidence', 0.80
                                                 )
                    WHERE id = %s AND district_admin_area_id IS NULL
                    """,
                    (aid, post_id),
                )
        conn.commit()
        print("  done")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frequency", action="store_true",
                    help="подсчитать частоту «ский»-слов + заглавных токенов")
    ap.add_argument("--check", action="store_true",
                    help="прогнать regex-словарь и сравнить с Natasha (default)")
    ap.add_argument("--write", action="store_true",
                    help="записать regex-only матчи в vk_post (только где Natasha вернула NULL)")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if not args.frequency and not args.check:
        args.check = True  # default

    dsn = build_dsn()
    with psycopg.connect(dsn) as conn:
        if args.frequency:
            frequency_mode(conn, args.limit)
        if args.check:
            check_mode(conn, args.limit, args.write)


if __name__ == "__main__":
    main()
