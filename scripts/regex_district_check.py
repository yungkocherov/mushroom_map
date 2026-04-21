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

# Структура: name -> {"kind": ..., "patterns": [...]}
# kind = "district_lo"  — один из 18 районов Ленобласти (идут в district_admin_area_id)
#      | "subject_ru"   — соседний субъект РФ (Карелия/Новгородская/Псковская)
#      | "district_spb" — район Санкт-Петербурга
#      | "city"         — города-сами-субъекты или крупные (СПб, Москва)
DISTRICT_PATTERNS: dict[str, dict] = {
    "Бокситогорский район": {"kind": "district_lo", "patterns": [
        r"\bбокситогорск\w*",
        r"\bпикал[её]в\w*",
    ]},
    "Волосовский район": {"kind": "district_lo", "patterns": [
        r"\bволосовск\w*",
        r"\bволосов[оае]?\b",
        r"\bбегуниц\w*",
    ]},
    "Волховский район": {"kind": "district_lo", "patterns": [
        r"\bволховск\w*",
        r"\bволхов\w*",
        r"\bновая\s+ладога\b",
        r"\bсясьстрой\w*",
    ]},
    "Всеволожский район": {"kind": "district_lo", "patterns": [
        r"\bвсеволожск\w*",
        r"\bлемболов\w*",
        r"\bтоксов\w*",
        r"\bкавголов\w*",
        r"\bмурин\w*",
        r"\bколтуш\w*",
        r"\bоржицы\b",
        r"\bсертолов\w*",
        r"\bромашк\w+\s+оз",
    ]},
    "Выборгский район": {"kind": "district_lo", "patterns": [
        r"\bвыборгск\w*",
        r"\bвыборг[аеу]?\b",
        r"\bрощин\w*",
        r"\bзеленогорск\w*",
        r"\bкирилловск\w*",
        r"\bзаходское\b",
        r"\bпервомайск\w*",
    ]},
    "Гатчинский муниципальный округ": {"kind": "district_lo", "patterns": [
        r"\bгатчинск\w*",
        r"\bгатчин[ае]?\b",
        r"\bвырицк?\w*",
        r"\bсиверск\w*",
        r"\bкоммунарск?\w*",
        r"\bверевск\w*",
        r"\bорлин\w*",
        r"\bдружн\w*\s+г",
    ]},
    "Кингисеппский район": {"kind": "district_lo", "patterns": [
        r"\bкингисепп?ск\w*",
        r"\bкингисепп?\b",
        r"\bивангород\w*",
        r"\bусть[- ]лу\w*",
    ]},
    "Киришский район": {"kind": "district_lo", "patterns": [
        r"\bкиришск\w*",
        r"\bкириш[аеуи]?\b",
    ]},
    "Кировский район": {"kind": "district_lo", "patterns": [
        r"\bкировск\w*\s+р",        # «Кировский район»
        r"\bкировск\b",             # Кировск-город
        r"\bмга\b",
        r"\bшлиссельбург\w*",
        r"\bпутилов\w*",
        r"\bсинявин\w*",
        r"\bназия\b",
    ]},
    "Лодейнопольский район": {"kind": "district_lo", "patterns": [
        r"\bлодейнопол\w*",
        r"\bлодейное\s+поле\b",
        r"\bсвирьстрой\w*",
        r"\bяндеб\w*",
    ]},
    "Ломоносовский район": {"kind": "district_lo", "patterns": [
        r"\bломоносовск\w*",
        r"\bнизин\w*",
        r"\bлопухинк\w*",
        r"\bгостилицк?\w*",
        r"\bбольшая\s+ижор\w*",
        r"\bкопорск?\w*",
    ]},
    "Лужский район": {"kind": "district_lo", "patterns": [
        r"\bлужск\w*",
        r"\b(?:в|из|под)\s+лу[ге]\w*",
        r"\bтолмачев\w*",
        r"\bмшинск\w*",
        r"\bоредеж\w*",
    ]},
    "Подпорожский район": {"kind": "district_lo", "patterns": [
        r"\bподпорожск\w*",
        r"\bподпорож[аеу]?\b",
        r"\bвознесен\w*\s+пос",
    ]},
    "Приозерский район": {"kind": "district_lo", "patterns": [
        r"\bприозерск\w*",
        r"\bлосев\w*",
        r"\bорехов\w*",
        r"\bсосново\b",
        r"\bпетяярв\w*",
        r"\bгромов\w*",
        r"\bкузнечн\w*",
        r"\bпятиречь\w*",
    ]},
    "Сланцевский район": {"kind": "district_lo", "patterns": [
        r"\bсланцевск\w*",
        r"\bсланц[ыи]\b",
    ]},
    "Сосновоборский городской округ": {"kind": "district_lo", "patterns": [
        r"\bсосновоборск\w*",
        r"\bсосновый\s+бор\b",
    ]},
    "Тихвинский район": {"kind": "district_lo", "patterns": [
        r"\bтихвинск\w*",
        r"\bтихвин[аеу]?\b",
    ]},
    "Тосненский район": {"kind": "district_lo", "patterns": [
        r"\bтосненск\w*",
        r"\bтосн[оае]\b",
        r"\bлюбан\w*",
        r"\bульяновк\w*",
        r"\bфорносов\w*",
    ]},

    # ── Соседние субъекты РФ ─────────────────────────────────────────────
    # Карелию часто упоминают как «Карельский перешеек» — формально ЛО
    # (части Выборгского/Приозерского), но когда пост назван именно
    # «Карелия/Республика Карелия» — это Карелия как субъект.
    # Для однозначности используем корень «карел» в широком матче — потом
    # фильтр в forecast-репо разрулит по контексту.
    "Карелия": {"kind": "subject_ru", "patterns": [
        r"\bкарел[ьияеу]\w*",            # Карелия, Карелии, карельский, Карельский
        r"\bрусскинская\b",
        r"\bсортавал\w*",                # Сортавала
        r"\bпряж\w+\s+(?:пос|р-?н|район)",
        r"\bмедвежьегорск\w*",
        r"\bкондопо[жг]\w*",
        r"\bолонец\w*",
    ]},
    "Новгородская область": {"kind": "subject_ru", "patterns": [
        r"\bновгородск\w*",
        r"\bновгородчин\w*",
        r"\b(?:великий\s+)?новгород[аеу]?\b",
        r"\bстарая\s+русса\b",
        r"\bваллдай\w*",
    ]},
    "Псковская область": {"kind": "subject_ru", "patterns": [
        r"\bпсковск\w*",
        r"\bпсков[аеу]?\b",
        r"\bпечор\w*",
        r"\bопочк\w*",
    ]},
    "Тверская область": {"kind": "subject_ru", "patterns": [
        r"\bтверск\w*",
        r"\bтверь\b",
    ]},
    "Вологодская область": {"kind": "subject_ru", "patterns": [
        r"\bвологодск\w*",
        r"\bвологд\w*",
    ]},

    # ── Санкт-Петербург: сам город и его административные районы ─────────
    # Район СПб ≠ район ЛО — другой admin_level=5. Сохраняем отдельным
    # kind. «Приморский», «Кировский» совпадают по имени с районами ЛО,
    # но в СПб они требуют контекста «Приморский район» (иначе не
    # различить); на LO-district их матчи выше имеют приоритет когда
    # упомянут ЛО-корневой топоним.
    "Санкт-Петербург": {"kind": "city", "patterns": [
        r"\bсанкт[- ]петербург\w*",
        r"\bспб\b",
        r"\bпитер[аеуом]?\b",
    ]},
    "СПб: Курортный район": {"kind": "district_spb", "patterns": [
        r"\bкурортн\w+\s+р(?:айон)?",
        r"\b#курортный\b",
        r"\bсестрорецк\w*",
        r"\bзеленогорск\w*\s+(?:пос|парк|пляж)",   # Зеленогорск тоже в Курортном СПб
        r"\bрепино\b",
        r"\bкомарово\b",
    ]},
    "СПб: Приморский район": {"kind": "district_spb", "patterns": [
        r"\bприморск\w+\s+р(?:айон)?",
        r"\b#приморский\b",
        r"\bстарая\s+деревня\b",
        r"\bколомяги\b",
    ]},
    "СПб: Колпинский район": {"kind": "district_spb", "patterns": [
        r"\bколпин\w*",
        r"\bметаллострой\w*",
    ]},
    "СПб: Пушкинский район": {"kind": "district_spb", "patterns": [
        r"\bпушкинск\w+\s+р(?:айон)?",
        r"\b#пушкинский\b",
        r"\bцарское\s+село\b",
        r"\bпавловск\w*",
    ]},
    "СПб: Красносельский район": {"kind": "district_spb", "patterns": [
        r"\bкрасносельск\w*",
    ]},
    "СПб: Невский район": {"kind": "district_spb", "patterns": [
        r"\bневск\w+\s+р(?:айон)?",
        r"\b#невский\b",
        r"\bрыбацкое\b",
    ]},
    "СПб: Выборгский район": {"kind": "district_spb", "patterns": [
        r"\b#выборгский\s+район\s+спб\b",
        # отдельного чёткого pattern нет — часто путают с ЛО. Оставляем пустой,
        # если нужно — forecast-репо разрулит по контексту.
    ]},

    # ── Москва и МО (встречаются редко, но для полноты) ──────────────────
    "Москва": {"kind": "city", "patterns": [
        r"\bмосквич\w*",
        r"\bмоскв[аеу]\b",
        r"\bмосковск\w+\s+обл",
    ]},
}

# Компилируем с re.IGNORECASE один раз
COMPILED: dict[str, dict] = {
    name: {
        "kind": meta["kind"],
        "patterns": [re.compile(p, re.IGNORECASE) for p in meta["patterns"]],
    }
    for name, meta in DISTRICT_PATTERNS.items()
    if meta["patterns"]  # СПб Выборгский имеет пустой список — пропускаем
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

def detect_places(text: str) -> list[dict]:
    """Возвращает все матчи: [{"name": ..., "kind": ...}, ...]."""
    if not text:
        return []
    hits: list[dict] = []
    for name, meta in COMPILED.items():
        for rx in meta["patterns"]:
            if rx.search(text):
                hits.append({"name": name, "kind": meta["kind"]})
                break
    return hits


def match_districts(text: str) -> set[str]:
    """Только LO-districts (для обратной совместимости с --write)."""
    return {h["name"] for h in detect_places(text) if h["kind"] == "district_lo"}


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
    missing_lo = [
        name for name, meta in DISTRICT_PATTERNS.items()
        if meta["kind"] == "district_lo" and name not in id_by_name
    ]
    if missing_lo:
        print(f"WARN: admin_area не содержит LO-района: {missing_lo}")

    # ── LO-статы (как раньше, для совместимости) ────────────────────────
    regex_assigned = 0
    regex_ambiguous = 0
    regex_none = 0
    regex_by_district: Counter[str] = Counter()
    both_same = 0
    both_differ = 0
    only_regex = 0
    only_natasha = 0
    disagreements: list[tuple[int, str, str, str]] = []
    lo_write_candidates: list[tuple[int, int]] = []

    # ── Outside-LO / СПб / Карелия статы ────────────────────────────────
    by_kind: Counter[str] = Counter()
    by_place: Counter[str] = Counter()
    place_update_rows: list[tuple[int, list[dict]]] = []

    for post_id, text, natasha_id, natasha_name in rows:
        places = detect_places(text)
        lo_hits = {p["name"] for p in places if p["kind"] == "district_lo"}

        # LO-матчинг (как раньше)
        if len(lo_hits) == 0:
            regex_none += 1
        elif len(lo_hits) == 1:
            regex_assigned += 1
            regex_by_district[next(iter(lo_hits))] += 1
        else:
            regex_ambiguous += 1

        if natasha_name is None and len(lo_hits) == 1:
            only_regex += 1
            aid = id_by_name.get(next(iter(lo_hits)))
            if aid is not None:
                lo_write_candidates.append((post_id, aid))
        elif natasha_name is not None and len(lo_hits) == 0:
            only_natasha += 1
        elif natasha_name is not None and len(lo_hits) >= 1:
            if natasha_name in lo_hits:
                both_same += 1
            else:
                both_differ += 1
                if len(disagreements) < 10:
                    preview = (text[:140] or "").replace("\n", " ")
                    disagreements.append((post_id, natasha_name, "|".join(sorted(lo_hits)), preview))

        # Все kind'ы для общей статистики и detected_places
        for p in places:
            by_kind[p["kind"]] += 1
            by_place[p["name"]] += 1

        # detected_places пишем для каждого поста, у которого хоть что-то нашлось
        if places:
            place_update_rows.append((post_id, places))

    total = len(rows)
    print(f"\n== LO district stats ==")
    print(f"  total                 {total}")
    print(f"  assigned (unique LO)  {regex_assigned}  ({regex_assigned/total*100:.1f}%)")
    print(f"  ambiguous (>1 LO)     {regex_ambiguous} ({regex_ambiguous/total*100:.1f}%)")
    print(f"  no LO match           {regex_none}      ({regex_none/total*100:.1f}%)")

    print(f"\n== all detected_places by kind ==")
    for kind, n in by_kind.most_common():
        print(f"  {kind:18s} {n}")

    print(f"\n== regex vs natasha (LO only) ==")
    print(f"  both agree            {both_same}")
    print(f"  both differ           {both_differ}")
    print(f"  only regex            {only_regex}")
    print(f"  only natasha          {only_natasha}")

    print(f"\n== top places (all kinds) ==")
    for name, n in by_place.most_common(30):
        kind = DISTRICT_PATTERNS[name]["kind"]
        print(f"  [{kind:14s}] {name:40s} {n}")

    if disagreements:
        print(f"\n== sample LO-disagreements (natasha != regex) ==")
        for pid, nat, rg, preview in disagreements:
            print(f"  post {pid}: natasha={nat}, regex={rg}")
            print(f"    text: {preview}")

    if not write:
        return

    # ── Запись ──────────────────────────────────────────────────────────
    # 1. LO-unique матчи в district_admin_area_id (только где natasha=NULL)
    if lo_write_candidates:
        print(f"\n== writing {len(lo_write_candidates)} LO-only regex matches to district_admin_area_id ==")
        with conn.transaction():
            for post_id, aid in lo_write_candidates:
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

    # 2. detected_places пишем для ВСЕХ постов с матчами
    #    (в т.ч. где district уже проставлен Natasha — добавляем outside-LO
    #    и другие findings; это не конфликтует с district_admin_area_id).
    print(f"\n== writing detected_places for {len(place_update_rows)} posts ==")
    with conn.transaction():
        for post_id, places in place_update_rows:
            conn.execute(
                """
                UPDATE vk_post
                SET place_match = COALESCE(place_match, '{}'::jsonb)
                                  || jsonb_build_object('detected_places', %s::jsonb)
                WHERE id = %s
                """,
                (json.dumps(places, ensure_ascii=False), post_id),
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
