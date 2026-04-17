"""
VK → observation pipeline (DB-backed, инкрементальный).

Все стадии читают/пишут vk_post; observation получается на финальной стадии.
Каждая стадия обрабатывает только то, что ещё не сделано — повторный
запуск добирает новое, не трогает уже готовое.

Стадии:
  1. collect  — fetch новых постов из VK API (MAX(date_ts) как cutoff);
                INSERT INTO vk_post ON CONFLICT DO NOTHING.
  2. dates    — для vk_post.foray_date IS NULL: regex-парсинг текста;
                --llm добавляет Claude-фоллбэк на не распознанное.
  3. photos   — для vk_post.photo_processed_at IS NULL: LM Studio (Gemma).
                Пропускает зимние месяцы и «нерелевантные» по тексту.
  4. promote  — INSERT INTO observation из vk_post, где есть и foray_date
                и photo_species; флаг observation_written = TRUE.

Запуск:
  python pipelines/ingest_vk.py --group grib_spb --region lenoblast
  python pipelines/ingest_vk.py --group grib_spb --step collect
  python pipelines/ingest_vk.py --group grib_spb --step dates --limit 5000
  python pipelines/ingest_vk.py --group grib_spb --step photos --limit 500
  python pipelines/ingest_vk.py --group grib_spb --step promote --region lenoblast

Env (.env):
  VK_TOKEN          — токен ВК API
  DATABASE_URL      — postgresql://... (или POSTGRES_* переменные)
  LM_STUDIO_URL     — http://127.0.0.1:1234/v1/chat/completions
  LM_STUDIO_MODEL   — google/gemma-3-12b
  ANTHROPIC_API_KEY — опционально, для даты-фоллбэка
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg
import requests
from dotenv import load_dotenv
from tqdm import tqdm

# ─── Конфиг ──────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env")

VK_TOKEN        = os.getenv("VK_TOKEN", "")
VK_API_VERSION  = "5.131"
VK_BATCH_SIZE   = 100
VK_DELAY_SEC    = 0.35

LM_STUDIO_URL   = os.getenv("LM_STUDIO_URL",
                            "http://127.0.0.1:1234/v1/chat/completions")
LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "google/gemma-3-12b")


def build_database_url() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    user = os.getenv("POSTGRES_USER",     "mushroom")
    pw   = os.getenv("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.getenv("POSTGRES_HOST",     "127.0.0.1")
    port = os.getenv("POSTGRES_PORT",     "5434")
    db   = os.getenv("POSTGRES_DB",       "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


# Версия промпта и маппинга — при изменении бампается, photos-stage
# автоматически перегоняет все посты где photo_prompt_version != текущей.
PHOTO_PROMPT_VERSION = "v3-nine-species-2026-04-17"

# Маппинг ключей от Gemma → slug'и в таблице species.
# Сознательно ограничен 9 категориями — Gemma 12B Vision не различает
# мухоморов по виду, подосиновики по сортам, маслёнков/моховиков/польского
# и прочее на уровне достаточном для ingest. Лучше честное «other»
# чем ложная точность.
#
# Один ключ → несколько slug'ов там где Gemma не может различить
# (подосиновик красный vs жёлто-бурый — пишем оба; сморчок/сморчковая
# шапочка/строчок — пишем все три).
GROUP_TO_SLUGS: dict[str, list[str]] = {
    "porcini":             ["boletus-edulis"],                               # Белый
    "aspen_bolete":        ["leccinum-aurantiacum", "leccinum-versipelle"],  # Подосиновик
    "birch_bolete":        ["leccinum-scabrum"],                             # Подберёзовик
    "chanterelle":         ["cantharellus-cibarius"],                        # Лисичка
    "trumpet_chanterelle": ["craterellus-tubaeformis"],                      # Лисичка трубчатая
    "spring_mushroom":     ["morchella-esculenta",                           # Сморчок /
                            "verpa-bohemica",                                # сморчковая шапочка /
                            "gyromitra-esculenta"],                          # строчок
    "honey_fungus":        ["armillaria-mellea", "kuehneromyces-mutabilis"], # Опята
    "oyster":              ["pleurotus-ostreatus"],                          # Вешенка
    "russula":             ["russula-vesca"],                                # Сыроежка
    # "other" / "none" → игнорируем (нет соответствующего slug'а)
}

# Нерелевантные посты на стадии фото (не про реальный сбор грибов).
SKIP_PHOTO_RE = re.compile("|".join([
    r"рецепт", r"приготовл",
    r"жарен|варен|тушен|маринов",
    r"суп\b|пирог|жульен|соус",
    r"продаж|куплю|продам|цена",
    r"отравлен|ядовит|опасн",
    r"реклам|подписк|розыгрыш",
    r"прогноз\s+погод",
    r"стих|поэзи|цитат",
    r"конкурс|голосован",
    r"клещ|змея|медвед",
    r"ягод[аыу]|клюкв|брусник|черник|морошк",
    r"рыбалк|рыб[аыу]\b|щук[аиу]|окун[ьяей]|удочк|спиннинг",
    r"ничего\s+не\s+наш",
    r"пустой?\s+корзин",
    r"без\s+гриб",
    r"\bпролёт\b",
    r"фотоохот",
    r"птиц[аыу]|пернат",
    r"закат[а-я]*|рассвет",
    r"с\s+днём?\s+рождени|день\s+рождени|\bдр\b|поздравля",
    r"с\s+новым\s+год|новогодн",
    r"8\s*марта|23\s*февраля|день\s+защитника",
]), re.IGNORECASE)

# Посты про которые ТОЧНО не нужно извлекать foray_date
SKIP_DATE_RE = re.compile("|".join([
    r"архив",
    r"с\s+днём?\s+рождени|день\s+рождени|\bдр\b|поздравля",
    r"с\s+новым\s+год|новогодн",
    r"8\s*марта|23\s*февраля|день\s+защитника",
]), re.IGNORECASE)

CLASSIFY_PROMPT = """You are classifying mushroom photos from a VK foraging group.
Return JSON only: [{"species": "<key>", "count": N}, ...]

CRITICAL RULES — read carefully:

1. If you are NOT VISUALLY CERTAIN which key fits → use "other".
   Do NOT guess based on context. Do NOT "stretch" a photo to fit a key.
   A fuzzy photo, a single blurry cap, unusual angle → "other".

2. If there are NO mushrooms at all → return []
   (pure landscape, recipe, berries, fish, people without mushrooms, etc.)

3. Mushrooms visible but none match the keys below → "other"
   (e.g. boletus other than the three listed; amanita; parasol;
    lactarius/milkcaps; truffles — all go to "other")

4. Multiple distinct species in one photo → multiple entries in array.

Counting: full basket ≈ 30-50, handful ≈ 5-10, a couple ≈ 1-3.

KEYS (use ONLY when visually unambiguous):

- porcini — thick bulbous WHITE stem with fine white NETTING pattern,
  brown cap, cream or white pores underneath. "Белый гриб"

- aspen_bolete — ORANGE or red-orange cap + dark SPECKLED stem.
  The cap colour is the dead giveaway. "Подосиновик"

- birch_bolete — GREY-BROWN or BROWN smooth cap (NOT orange) +
  dark speckled stem. "Подберёзовик"

- chanterelle — BRIGHT GOLDEN-YELLOW, funnel/trumpet shape, false
  gills running down the stem. "Лисичка обыкновенная"

- trumpet_chanterelle — SMALL BROWN-GREY funnel, HOLLOW stem,
  usually in groups on forest floor. "Лисичка трубчатая"

- spring_mushroom — WRINKLED, HONEYCOMB or BRAIN-like cap.
  Spring-only (Apr-May). Covers сморчок, сморчковая шапочка, строчок
  — they look similar enough to group.

- honey_fungus — CLUSTERS of small tan caps growing on wood or
  at tree base. Often with a ring on stem. "Опёнок"

- oyster — LARGE SHELL- or FAN-shaped white/grey caps growing
  SIDEWAYS out of tree trunks or logs. No central stem. "Вешенка"

- russula — BRITTLE, flat-open cap in bright colours (red, yellow,
  green, purple), WHITE stem, NO ring. "Сыроежка"

- other — any mushroom that doesn't CLEARLY match one of the above.
  Maslenki, mokhoviki, polish bolete, amanitas, milkcaps, parasols,
  anything unclear — all go here.

- none — no mushrooms in the photo at all.

Examples:
- Basket full of cream-capped mushrooms with thick netted stems →
  [{"species":"porcini","count":20}]
- One orange-capped mushroom in forest →
  [{"species":"aspen_bolete","count":1}]
- Fried mushrooms in a pan →
  []
- Photo of a river and fishing rod →
  []
- Cluster of small brown mushrooms on a tree stump →
  [{"species":"honey_fungus","count":15}]
- Some mushroom but unclear which type →
  [{"species":"other","count":3}]
- A red mushroom with white dots (fly agaric) →
  [{"species":"other","count":1}]  (NOT in our key list → other)"""


# ═══════════════════════════════════════════════════════════════════════════
#  СТАДИЯ 1: COLLECT — fetch новых постов из VK
# ═══════════════════════════════════════════════════════════════════════════

def vk_request(method: str, params: dict, retries: int = 5) -> dict:
    url = f"https://api.vk.com/method/{method}"
    params = {**params, "access_token": VK_TOKEN, "v": VK_API_VERSION}
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(
                    f"VK API error {data['error']['error_code']}: "
                    f"{data['error']['error_msg']}"
                )
            return data["response"]
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  network error (try {attempt+1}/{retries}), wait {wait}s: {e}")
            time.sleep(wait)


def get_incremental_cutoff(
    conn: psycopg.Connection,
    group: str,
    years_back: int,
) -> datetime:
    """Нижняя граница дат для очередного collect-прогона.

    Если в vk_post уже есть посты этой группы — берём MAX(date_ts),
    таким образом фетчим только то что новее. Если пусто — уходим на
    `years_back` лет назад, это полный первичный сбор.
    """
    row = conn.execute(
        "SELECT MAX(date_ts) FROM vk_post WHERE vk_group = %s",
        (group,),
    ).fetchone()
    latest = row[0] if row else None
    if latest is not None:
        print(f"  cutoff: {latest.isoformat()} (last known post in DB)")
        return latest
    cutoff = datetime.now(tz=timezone.utc).replace(
        year=datetime.now().year - years_back
    )
    print(f"  cutoff: {cutoff.isoformat()} (years_back={years_back}, first run)")
    return cutoff


def collect_stage(
    conn: psycopg.Connection,
    group: str,
    years_back: int = 8,
) -> int:
    """Скачивает новые посты из VK и инсертит в vk_post.

    Возвращает количество ВСТАВЛЕННЫХ строк (на конфликте — игнор).
    """
    if not VK_TOKEN:
        raise SystemExit("VK_TOKEN пуст — проверьте .env")

    cutoff = get_incremental_cutoff(conn, group, years_back)
    cutoff_ts = int(cutoff.timestamp())

    total = vk_request("wall.get", {"domain": group, "count": 1, "filter": "owner"})["count"]
    print(f"  group has {total} posts total")

    inserted = 0
    offset = 0
    stopped_early = False

    with tqdm(desc=f"collect {group}", unit="post") as pbar:
        while True:
            resp = vk_request("wall.get", {
                "domain": group,
                "count": VK_BATCH_SIZE,
                "offset": offset,
                "filter": "owner",
            })
            batch = resp.get("items", [])
            if not batch:
                break

            rows = []
            for post in batch:
                if post["date"] <= cutoff_ts:
                    stopped_early = True
                    break
                photo_urls = [
                    max(a["photo"]["sizes"], key=lambda s: s["width"] * s["height"])["url"]
                    for a in post.get("attachments", [])
                    if a.get("type") == "photo" and a.get("photo", {}).get("sizes")
                ]
                rows.append((
                    group,
                    int(post["id"]),
                    datetime.fromtimestamp(post["date"], tz=timezone.utc),
                    post.get("text", "") or "",
                    int(post.get("likes",   {}).get("count", 0) or 0),
                    int(post.get("reposts", {}).get("count", 0) or 0),
                    int(post.get("views",   {}).get("count")) if post.get("views") else None,
                    photo_urls,
                ))

            if rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO vk_post
                          (vk_group, post_id, date_ts, text, likes, reposts,
                           views, photo_urls)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (vk_group, post_id) DO NOTHING
                        """,
                        rows,
                    )
                    inserted += cur.rowcount if cur.rowcount > 0 else 0
                conn.commit()

            offset += len(batch)
            pbar.update(len(batch))
            if stopped_early or offset >= total:
                break
            time.sleep(VK_DELAY_SEC)

    print(f"  inserted {inserted} new posts into vk_post")
    return inserted


# ═══════════════════════════════════════════════════════════════════════════
#  СТАДИЯ 2: DATES — regex-парсинг даты похода
# ═══════════════════════════════════════════════════════════════════════════

MONTHS_RU = {
    "январ": 1, "феврал": 2, "март": 3, "апрел": 4,
    "май": 5, "маи": 5, "июн": 6, "июл": 7, "август": 8,
    "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12,
}
MONTHS_RU_PATTERN = (
    r"(январ[яеьи]?|феврал[яеьи]?|марта?|апрел[яеьи]?|"
    r"ма[йи]|июн[яеьи]?|июл[яеьи]?|август[ае]?|"
    r"сентябр[яеьи]?|октябр[яеьи]?|ноябр[яеьи]?|декабр[яеьи]?)"
)
WEEKDAYS_RU = {
    "понедельник": 0, "вторник": 1, "среду": 2, "среда": 2,
    "четверг": 3, "пятницу": 4, "пятница": 4,
    "субботу": 5, "суббота": 5, "воскресенье": 6,
}


def _month_num(word: str) -> Optional[int]:
    w = word.lower()
    for prefix, num in MONTHS_RU.items():
        if w.startswith(prefix):
            return num
    return None


def parse_date_regex(text: str, post_dt: date) -> Optional[date]:
    """Ищет дату похода за грибами в тексте. Возвращает date или None."""
    text_lower = text.lower()

    # DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY
    m = re.search(r"(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})г?", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        if 3000 <= year <= 3099:
            year -= 1000
        if 1 <= month <= 12 and 1 <= day <= 31:
            try:
                return date(year, month, day)
            except ValueError:
                pass

    # "27-28.01.26"
    m = re.search(r"(\d{1,2})-\d{1,2}\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})г?", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        if 1 <= month <= 12 and 1 <= day <= 31:
            try:
                return date(year, month, day)
            except ValueError:
                pass

    # DD.MM без года
    m = re.search(r"\b(\d{1,2})[./\\](\d{1,2})\b", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        # Отсекаем «15.30» = время
        looks_like_time = (day <= 23 and month <= 59 and month > 12)
        if not looks_like_time and 1 <= month <= 12 and 1 <= day <= 31:
            year = post_dt.year
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d
            except ValueError:
                pass

    # DD месяц [YYYY]
    m = re.search(rf"\b(\d{{1,2}})\s+{MONTHS_RU_PATTERN}(?:\s+(\d{{4}}))?", text_lower)
    if m:
        day = int(m.group(1))
        month = _month_num(m.group(2))
        year = int(m.group(3)) if m.group(3) else post_dt.year
        if month:
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d
            except ValueError:
                pass

    # месяц DD [YYYY]
    m = re.search(rf"{MONTHS_RU_PATTERN}\s+(\d{{1,2}})(?:\s+(\d{{4}}))?", text_lower)
    if m:
        month = _month_num(m.group(1))
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else post_dt.year
        if month:
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d
            except ValueError:
                pass

    # день недели («в субботу»)
    m = re.search(r"\bв\s+(" + "|".join(WEEKDAYS_RU) + r")\b", text_lower)
    if m:
        target_wd = WEEKDAYS_RU[m.group(1)]
        days_back = (post_dt.weekday() - target_wd) % 7 or 7
        if days_back <= 14:
            return post_dt - timedelta(days=days_back)

    # относительные
    if re.search(r"\bсегодня\b", text_lower):
        return post_dt
    if re.search(r"\bвчера\b", text_lower):
        return post_dt - timedelta(days=1)
    if re.search(r"\bпозавчера\b", text_lower):
        return post_dt - timedelta(days=2)

    return None


def parse_date_llm(text: str, post_dt: date) -> Optional[date]:
    """Claude-фоллбэк, вызывается только при --llm."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": (
                f"Вот текст поста грибников. Дата публикации: {post_dt.isoformat()}.\n"
                "Определи дату похода за грибами (не дата публикации).\n"
                "Ответь ТОЛЬКО датой YYYY-MM-DD. Если дата не указана — UNKNOWN.\n\n"
                f"Текст:\n{text[:800]}"
            )}],
        )
        result = msg.content[0].text.strip()
        return datetime.strptime(result, "%Y-%m-%d").date()
    except Exception:
        return None


def dates_stage(
    conn: psycopg.Connection,
    group: Optional[str],
    use_llm: bool,
    limit: Optional[int],
) -> int:
    """Для каждого vk_post без date_source — запускаем regex (и LLM при --llm).

    Возвращает количество обновлённых строк.
    """
    sql = """
        SELECT id, post_id, date_ts, text
        FROM vk_post
        WHERE date_source IS NULL
    """
    params: list = []
    if group:
        sql += " AND vk_group = %s"
        params.append(group)
    sql += " ORDER BY date_ts DESC"
    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    print(f"  {len(rows)} posts to process")

    updates: list[tuple] = []
    stats = {"regex": 0, "llm": 0, "skipped": 0, "no_text": 0, "not_found": 0}

    for row in tqdm(rows, desc="dates", unit="post"):
        pk, _post_id, date_ts, text = row
        post_dt = date_ts.date()

        if not text or not text.strip():
            source, foray = "no_text", None
        elif SKIP_DATE_RE.search(text):
            source, foray = "skipped", None
        else:
            foray = parse_date_regex(text, post_dt)
            if foray:
                source = "regex"
            elif use_llm:
                foray = parse_date_llm(text, post_dt)
                source = "llm" if foray else "not_found"
            else:
                source = "not_found"

        stats[source if source in stats else "not_found"] += 1
        updates.append((foray, source, pk))

    if updates:
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE vk_post SET foray_date = %s, date_source = %s WHERE id = %s",
                updates,
            )
        conn.commit()

    n = len(updates)
    print(f"  updated {n}: regex={stats['regex']} llm={stats['llm']} "
          f"skipped={stats['skipped']} no_text={stats['no_text']} "
          f"not_found={stats['not_found']}")
    return n


# ═══════════════════════════════════════════════════════════════════════════
#  СТАДИЯ 3: PHOTOS — классификация через LM Studio (Gemma)
# ═══════════════════════════════════════════════════════════════════════════

WINTER_MONTHS = {11, 12, 1, 2, 3}


def _download_photo(url: str, timeout: int = 15) -> Optional[bytes]:
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code == 200 and len(r.content) > 1000:
            return r.content
    except Exception:
        pass
    return None


def _ask_model(image_bytes: bytes) -> list[dict]:
    img_b64 = base64.b64encode(image_bytes).decode()
    try:
        resp = requests.post(LM_STUDIO_URL, json={
            "model": LM_STUDIO_MODEL,
            "messages": [{"role": "user", "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                {"type": "text", "text": CLASSIFY_PROMPT},
            ]}],
            "temperature": 0.1,
            "max_tokens": 200,
        }, timeout=60)
        if resp.status_code != 200:
            return []
        text = resp.json()["choices"][0]["message"]["content"].strip()
        # диапазоны count: 30-50 → строка
        text = re.sub(r'"count"\s*:\s*(\d+)\s*-\s*(\d+)', r'"count": "\1-\2"', text)
        m = re.search(r"\[.*?\]", text, re.DOTALL)
        if m:
            try:
                out = json.loads(m.group())
                if isinstance(out, list):
                    return out
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"  model error: {e}")
    return []


def _normalize_count(cnt) -> int:
    if isinstance(cnt, str) and "-" in cnt:
        try:
            a, b = cnt.split("-")
            return min((int(a) + int(b)) // 2, 150)
        except (ValueError, IndexError):
            return 0
    try:
        return min(int(cnt), 150)
    except (ValueError, TypeError):
        return 0


def photos_stage(
    conn: psycopg.Connection,
    group: Optional[str],
    limit: Optional[int],
    n_workers: int = 4,
    reprocess: bool = False,
) -> int:
    """Классифицирует фото. Обрабатывает посты где photo_processed_at IS NULL
    или photo_prompt_version отличается от текущей PHOTO_PROMPT_VERSION.

    При reprocess=True — берёт ВСЕ посты этой группы (игнорируя фильтры),
    даже если они уже были обработаны с текущей версией.

    Пропускает зимние месяцы, посты без фото, посты с нерелевантным текстом
    (для них ставит photo_species = [] и помечает текущую версию).
    """
    try:
        base = LM_STUDIO_URL.rsplit("/chat/completions", 1)[0]
        requests.get(f"{base}/models", timeout=5)
    except Exception:
        print(f"LM Studio недоступна: {LM_STUDIO_URL}")
        print("Запустите сервер LM Studio и укажите LM_STUDIO_URL в .env")
        sys.exit(1)
    print(f"  LM Studio: {LM_STUDIO_URL}  model: {LM_STUDIO_MODEL}")
    print(f"  prompt version: {PHOTO_PROMPT_VERSION}")

    sql = """
        SELECT id, post_id, date_ts, text, photo_urls
        FROM vk_post
        WHERE 1=1
    """
    params: list = []
    if not reprocess:
        sql += """
            AND (photo_processed_at IS NULL
                 OR photo_prompt_version IS DISTINCT FROM %s)
        """
        params.append(PHOTO_PROMPT_VERSION)
    if group:
        sql += " AND vk_group = %s"
        params.append(group)
    sql += " ORDER BY date_ts DESC"
    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    print(f"  {len(rows)} posts to process"
          f"{' (reprocessing all)' if reprocess else ''}")
    if not rows:
        return 0

    # Разделяем: сразу помечаем «пусто» либо отправляем модели
    skip_updates = []
    to_process = []
    for pk, _post_id, date_ts, text, photo_urls in rows:
        if not photo_urls:
            skip_updates.append((json.dumps([]), PHOTO_PROMPT_VERSION, pk))
            continue
        if date_ts.month in WINTER_MONTHS:
            skip_updates.append((json.dumps([]), PHOTO_PROMPT_VERSION, pk))
            continue
        if text and SKIP_PHOTO_RE.search(text):
            skip_updates.append((json.dumps([]), PHOTO_PROMPT_VERSION, pk))
            continue
        to_process.append((pk, photo_urls))

    if skip_updates:
        with conn.cursor() as cur:
            cur.executemany(
                """UPDATE vk_post SET
                     photo_species = %s::jsonb,
                     photo_processed_at = now(),
                     photo_prompt_version = %s
                   WHERE id = %s""",
                skip_updates,
            )
        conn.commit()
        print(f"  {len(skip_updates)} posts skipped (winter / no photos / irrelevant)")

    print(f"  {len(to_process)} posts go to LM Studio")

    def process_one(pk: int, urls: list[str]) -> tuple[int, list[dict]]:
        combined: dict[str, int] = {}
        # Семплирование по числу фото в посте.
        # Данные показывают: 66% постов имеют 3+ фото, текущая эвристика
        # "первое + последнее" теряла середину. Компромисс между охватом и
        # стоимостью: до 4 вызовов на пост.
        n = len(urls)
        if n <= 2:
            sample_urls = list(urls)
        elif n <= 5:
            sample_urls = [urls[0], urls[n // 2], urls[-1]]
        else:
            sample_urls = [urls[0], urls[n // 3], urls[2 * n // 3], urls[-1]]
        for url in sample_urls:
            img = _download_photo(url)
            if img is None:
                continue
            items = _ask_model(img)
            for it in items:
                sp = it.get("species", "")
                cnt = _normalize_count(it.get("count", 0))
                if sp:
                    combined[sp] = max(combined.get(sp, 0), cnt)
        result = [{"species": s, "count": c} for s, c in combined.items()]
        return pk, result

    BATCH = 100
    total_updated = len(skip_updates)

    for start in range(0, len(to_process), BATCH):
        batch = to_process[start : start + BATCH]
        photo_updates = []
        with ThreadPoolExecutor(max_workers=n_workers) as ex:
            futures = {ex.submit(process_one, pk, urls): pk for pk, urls in batch}
            for fut in tqdm(as_completed(futures), total=len(futures),
                            desc=f"photos {start}/{len(to_process)}", unit="post"):
                pk, result = fut.result()
                photo_updates.append((
                    json.dumps(result, ensure_ascii=False),
                    PHOTO_PROMPT_VERSION,
                    pk,
                ))

        with conn.cursor() as cur:
            cur.executemany(
                """UPDATE vk_post SET
                     photo_species = %s::jsonb,
                     photo_processed_at = now(),
                     photo_prompt_version = %s
                   WHERE id = %s""",
                photo_updates,
            )
        conn.commit()
        total_updated += len(photo_updates)

    print(f"  processed {total_updated} posts")
    return total_updated


# ═══════════════════════════════════════════════════════════════════════════
#  СТАДИЯ 4: PROMOTE — vk_post → observation
# ═══════════════════════════════════════════════════════════════════════════

def promote_stage(
    conn: psycopg.Connection,
    group: str,
    region_code: str,
) -> int:
    """Создаёт observation-записи из vk_post с foray_date + photo_species.

    Помечает обработанные как observation_written = TRUE.
    Для групп ядерных видов (bolete) делает несколько observation — по slug'у.
    """
    row = conn.execute(
        "SELECT id FROM region WHERE code = %s", (region_code,)
    ).fetchone()
    if row is None:
        raise SystemExit(f"регион {region_code!r} не найден")
    region_id = row[0]

    slug_to_id: dict[str, int] = {}
    for r in conn.execute("SELECT id, slug FROM species").fetchall():
        slug_to_id[r[1]] = r[0]
    print(f"  region_id={region_id}  species_in_db={len(slug_to_id)}")

    rows = conn.execute(
        """
        SELECT id, post_id, foray_date, photo_species, text
        FROM vk_post
        WHERE observation_written = FALSE
          AND foray_date IS NOT NULL
          AND photo_species IS NOT NULL
          AND jsonb_array_length(photo_species) > 0
          AND vk_group = %s
        """,
        (group,),
    ).fetchall()
    print(f"  {len(rows)} posts ready to promote")

    n_inserted = 0
    done_ids = []
    source_version = f"vk-{group}-{datetime.now().strftime('%Y-%m-%d')}"

    with conn.transaction():
        for vk_pk, post_id, foray_date, photo_species, text in rows:
            source_ref = f"{group}-{post_id}"
            text_excerpt = (text or "")[:300]
            any_inserted = False

            for item in photo_species:
                photo_group = item.get("species", "")
                if photo_group in ("none", "", "other", "ошибка"):
                    continue
                slugs = GROUP_TO_SLUGS.get(photo_group, [])
                if not slugs:
                    continue
                cnt = item.get("count") or None

                for slug in slugs:
                    sp_id = slug_to_id.get(slug)
                    if sp_id is None:
                        continue
                    conn.execute(
                        """
                        INSERT INTO observation
                          (region_id, source, source_ref, source_version,
                           species_id, species_raw, observed_on,
                           count_estimate, text_excerpt, meta)
                        VALUES (%s, 'vk', %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (source, source_ref, species_id) DO NOTHING
                        """,
                        (
                            region_id, source_ref, source_version,
                            sp_id, photo_group, foray_date,
                            cnt, text_excerpt,
                            json.dumps({"photo_group": photo_group,
                                        "vk_group": group}),
                        ),
                    )
                    n_inserted += 1
                    any_inserted = True

            # observation_written ставим в любом случае — мы честно попытались
            done_ids.append(vk_pk)
            _ = any_inserted  # для читаемости, не используем

        if done_ids:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE vk_post SET observation_written = TRUE WHERE id = %s",
                    [(i,) for i in done_ids],
                )

    print(f"  inserted {n_inserted} observations; "
          f"marked {len(done_ids)} vk_posts as written")

    # освежаем агрегаты
    try:
        conn.execute("REFRESH MATERIALIZED VIEW observation_region_species_stats")
    except psycopg.Error:
        pass
    try:
        conn.execute("REFRESH MATERIALIZED VIEW observation_h3_species_stats")
    except psycopg.Error:
        pass
    conn.commit()
    return n_inserted


# ═══════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

STEPS = ("collect", "dates", "photos", "promote")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--group",  default="grib_spb", help="VK domain (e.g. grib_spb)")
    ap.add_argument("--region", default="lenoblast", help="region.code для promote")
    ap.add_argument("--step",   choices=STEPS, help="одна стадия")
    ap.add_argument("--from",   dest="from_step", choices=STEPS,
                    help="стартовать с этой и идти дальше")
    ap.add_argument("--years-back", type=int, default=8,
                    help="сколько лет назад копать при первом сборе")
    ap.add_argument("--limit",  type=int, help="ограничение на стадиях dates/photos")
    ap.add_argument("--llm",    action="store_true",
                    help="Claude-фоллбэк для даты")
    ap.add_argument("--workers", type=int, default=4, help="параллельность LM Studio")
    ap.add_argument("--dsn", default=build_database_url())
    args = ap.parse_args()

    if args.step:
        run = [args.step]
    elif args.from_step:
        run = list(STEPS[STEPS.index(args.from_step):])
    else:
        run = list(STEPS)

    print(f"DB:      {args.dsn[:60]}...")
    print(f"group:   {args.group}")
    print(f"region:  {args.region}")
    print(f"stages:  {', '.join(run)}")

    conn = psycopg.connect(args.dsn, autocommit=False)
    try:
        if "collect" in run:
            print("\n── stage 1: collect ──")
            collect_stage(conn, args.group, years_back=args.years_back)
        if "dates" in run:
            print("\n── stage 2: dates ──")
            dates_stage(conn, args.group, use_llm=args.llm, limit=args.limit)
        if "photos" in run:
            print("\n── stage 3: photos (LM Studio) ──")
            photos_stage(conn, args.group, limit=args.limit, n_workers=args.workers)
        if "promote" in run:
            print("\n── stage 4: promote → observation ──")
            promote_stage(conn, args.group, args.region)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
