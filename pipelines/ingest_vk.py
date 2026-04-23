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
  3. photos   — для vk_post.photo_processed_at IS NULL: LM Studio (Qwen3.5).
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
  LM_STUDIO_MODEL   — qwen/qwen3.5-9b (по умолчанию)
  ANTHROPIC_API_KEY — опционально, для даты-фоллбэка
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
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
LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "qwen/qwen3.5-9b")
# Thinking-режим (Qwen3 etc) на классификации картинок не помогает и сильно
# замедляет прогон. Безвреден для моделей без thinking mode.
DISABLE_THINKING = os.getenv("DISABLE_THINKING", "1") == "1"


from db_utils import build_dsn as build_database_url


# Контракт с DB: при изменении бампаем — photos-stage автоматически перегоняет
# посты с photo_prompt_version != текущей. Файлы промпта/схемы версионируются
# по имени (vk_classify_v9.txt → vk_classify_v10.txt при новой версии).
PHOTO_PROMPT_VERSION = "v10-balance-porcini-aspen-2026-04-23"
_PROMPTS_DIR = Path(__file__).parent / "prompts"
CLASSIFY_PROMPT = (_PROMPTS_DIR / "vk_classify_v10.txt").read_text(encoding="utf-8")
CLASSIFY_SCHEMA = json.loads((_PROMPTS_DIR / "vk_classify_schema_v10.json").read_text(encoding="utf-8"))

# Один ключ → несколько slug'ов там где Gemma/Qwen не различают визуально
# (подосиновик красный vs жёлто-бурый; сморчок/шапочка/строчок; опёнок
# осенний vs летний). Ягоды без маппинга — promote их игнорирует.
GROUP_TO_SLUGS: dict[str, list[str]] = {
    "porcini":             ["boletus-edulis"],
    "pine_bolete":         ["boletus-edulis"],
    "aspen_bolete":        ["leccinum-aurantiacum", "leccinum-versipelle"],
    "birch_bolete":        ["leccinum-scabrum"],
    "mokhovik":            ["xerocomus-subtomentosus"],
    "chanterelle":         ["cantharellus-cibarius", "craterellus-tubaeformis"],
    "saffron_milkcap":     ["lactarius-deliciosus"],
    "white_milkcap":       ["lactarius-resimus"],
    "woolly_milkcap":      ["lactarius-torminosus"],
    "spring_mushroom":     ["morchella-esculenta", "verpa-bohemica", "gyromitra-esculenta"],
    "honey_fungus":        ["armillaria-mellea", "kuehneromyces-mutabilis"],
    "oyster":              ["pleurotus-ostreatus"],
    "russula":             ["russula-vesca"],
    "fly_agaric":          ["amanita-muscaria"],
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

    # Foray_date не может быть позже самого поста и раньше 2010 (до этого
    # VK-сообществ про грибы практически не было). Фильтр защищает от
    # regex-шума вида "10.08.2030" / "0202" / "15.30".
    def _year_ok(y: int) -> bool:
        return 2010 <= y <= post_dt.year + 1

    # DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY
    m = re.search(r"(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})г?", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        if 3000 <= year <= 3099:
            year -= 1000
        if 1 <= month <= 12 and 1 <= day <= 31 and _year_ok(year):
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
        if 1 <= month <= 12 and 1 <= day <= 31 and _year_ok(year):
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
        if month and _year_ok(year):
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
        if month and _year_ok(year):
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d
            except ValueError:
                pass

    # «октябрь 2023» / «в октябре 2023» / «октября 2023 года» — без дня.
    # День — случайный из [10, 25], чтобы downstream-агрегации не получали
    # искусственный пик на 15-м числе. Date_source стейдж проставит «regex».
    # Откат на год назад только если (year, month) строго позже поста.
    m = re.search(
        rf"\bв?\s*{MONTHS_RU_PATTERN}\s+(\d{{4}})(?:\s*г\.?|\s+года?)?\b",
        text_lower,
    )
    if m:
        month = _month_num(m.group(1))
        year = int(m.group(2))
        if month and _year_ok(year):
            if (year, month) > (post_dt.year, post_dt.month):
                year -= 1
            try:
                return date(year, month, random.randint(10, 25))
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


def has_unanchored_other_year(text: str, post_dt: date) -> bool:
    """True, если в тексте упоминается 4-значный год, отличный от года поста,
    и при этом parse_date_regex не нашёл ничего — то есть конкретного месяца/
    числа рядом с этим годом нет. Такие посты ссылаются на «прошлый сезон»
    в общем, без точной даты — для forecast-модели они бесполезны как
    датированные наблюдения, помечаем отдельным `date_source`.
    """
    years = [int(g) for g in re.findall(r"\b(20[1-2]\d)\b", text)]
    return any(2010 <= y <= post_dt.year and y != post_dt.year for y in years)


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
    stats = {"regex": 0, "llm": 0, "skipped": 0, "no_text": 0,
             "year_only_other": 0, "not_found": 0}

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
            if foray is None and source == "not_found" \
                    and has_unanchored_other_year(text, post_dt):
                source = "year_only_other"

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
          f"year_only_other={stats['year_only_other']} "
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


def _resize_image(image_bytes: bytes, max_side: int = 768) -> bytes:
    """Уменьшает изображение до max_side px по длинной стороне (JPEG, q=85)."""
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _ask_model(image_bytes: bytes, model: Optional[str] = None, retries: int = 3) -> list[dict]:
    """Отправляет фото в LM Studio. Возвращает список {species, count, scene}.

    Использует constrained sampling через response_format=json_schema,
    поэтому ответ ГАРАНТИРОВАННО валиден по CLASSIFY_SCHEMA — парсить
    regex'ами и чинить "count":30-50 больше не нужно.
    """
    image_bytes = _resize_image(image_bytes)
    img_b64 = base64.b64encode(image_bytes).decode()
    prompt_text = ("/no_think\n\n" if DISABLE_THINKING else "") + CLASSIFY_PROMPT
    payload = {
        "model": model or LM_STUDIO_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url",
             "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            {"type": "text", "text": prompt_text},
        ]}],
        "temperature": 0.1,
        "max_tokens": 1000,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "mushroom_classification",
                "strict": True,
                "schema": CLASSIFY_SCHEMA,
            },
        },
    }
    if DISABLE_THINKING:
        # Документированный способ Qwen3: параметр chat-шаблона.
        # `/no_think` в тексте пользователя LM Studio игнорирует.
        # Для моделей без thinking-mode этот параметр безвреден.
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    for attempt in range(retries):
        try:
            resp = requests.post(LM_STUDIO_URL, json=payload, timeout=120)
            if resp.status_code != 200:
                if attempt == retries - 1:
                    print(f"  model HTTP {resp.status_code}: {resp.text[:200]}")
                    return []
                time.sleep(2 ** attempt)
                continue

            data = resp.json()
            msg = data["choices"][0]["message"]
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning_content") or ""
            finish_reason = data["choices"][0].get("finish_reason")

            # Qwen3 через LM Studio кладёт ответ в reasoning_content, а
            # content оставляет пустым (считает всё «размышлением»).
            # /no_think не всегда убирает это — просто падаем в reasoning.
            raw = content.strip() or reasoning.strip()
            if not raw:
                print(f"  empty output: finish={finish_reason} "
                      f"usage={data.get('usage', {})}")
                return []

            # На всякий случай вырезаем <think>...</think> если модель
            # выдала их внутри поля (редко)
            raw = re.sub(r"<think>.*?</think>\s*", "", raw, flags=re.DOTALL)
            # ...и ```json … ``` обёртку
            m = re.search(r"\[.*\]", raw, re.DOTALL)
            if m:
                raw = m.group(0)

            try:
                out = json.loads(raw)
                if isinstance(out, list):
                    # Клипаем выбросы вроде «count»: 9999 — реальные сборы
                    # редко превышают 100-150 штук одного вида в кадре.
                    for it in out:
                        c = it.get("count")
                        if isinstance(c, int) and c > 150:
                            it["count"] = 150
                    return out
            except json.JSONDecodeError as e:
                print(f"  non-JSON: {e}\n  raw[:200]={raw[:200]}")
            return []

        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if attempt == retries - 1:
                print(f"  model network error after {retries} tries: {e}")
                return []
            time.sleep(2 ** attempt)
        except Exception as e:
            print(f"  model error: {e}")
            return []

    return []


def _normalize_count(cnt) -> int:
    """Schema гарантирует integer 0..500, но оставляем defensive обработку
    диапазонов и строк на случай если схема не активна (старый LM Studio /
    Structured Output выключен)."""
    if isinstance(cnt, str) and "-" in cnt:
        try:
            a, b = cnt.split("-")
            return min((int(a) + int(b)) // 2, 300)
        except (ValueError, IndexError):
            return 0
    try:
        return min(max(int(cnt), 0), 300)
    except (ValueError, TypeError):
        return 0


def photos_stage(
    conn: psycopg.Connection,
    group: Optional[str],
    limit: Optional[int],
    n_workers: int = 5,
    reprocess: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    model: Optional[str] = None,
) -> int:
    """Классифицирует фото через LM Studio.

    Результаты пишутся в vk_post_model_result (одна строка на (пост, модель))
    и дублируются в vk_post.photo_species для совместимости со стадией promote.

    При reprocess=True — перегоняет все посты, даже уже обработанные.
    """
    run_model = model or LM_STUDIO_MODEL

    try:
        base = LM_STUDIO_URL.rsplit("/chat/completions", 1)[0]
        r = requests.get(f"{base}/models", timeout=5)
        loaded = [m["id"] for m in r.json().get("data", [])]
    except Exception:
        print(f"LM Studio недоступна: {LM_STUDIO_URL}")
        print("Запустите сервер LM Studio и укажите LM_STUDIO_URL в .env")
        sys.exit(1)
    if run_model not in loaded:
        print(f"\n  ⚠  модель {run_model!r} НЕ загружена в LM Studio.")
        print(f"  Загружены: {loaded}")
        print(f"  Либо подгрузи нужную модель, либо укажи --model с ID из списка.\n")
        sys.exit(1)
    print(f"  LM Studio: {LM_STUDIO_URL}  model: {run_model}")
    print(f"  prompt version: {PHOTO_PROMPT_VERSION}  thinking: {'OFF' if DISABLE_THINKING else 'ON'}")

    sql = """
        SELECT id, post_id, date_ts, text, photo_urls
        FROM vk_post
        WHERE 1=1
    """
    params: list = []
    if not reprocess:
        # Пост нужно обработать если для этой (модели, версии) ещё нет строки
        sql += """
            AND NOT EXISTS (
                SELECT 1 FROM vk_post_model_result r
                WHERE r.vk_post_id = vk_post.id
                  AND r.model = %s
                  AND r.prompt_version = %s
            )
        """
        params.extend([run_model, PHOTO_PROMPT_VERSION])
    if group:
        sql += " AND vk_group = %s"
        params.append(group)
    if date_from:
        sql += " AND date_ts >= %s"
        params.append(date_from)
    if date_to:
        sql += " AND date_ts < %s"
        params.append(date_to)
    sql += " ORDER BY date_ts DESC, id DESC"  # id для детерминированности при ties
    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    range_note = ""
    if date_from or date_to:
        range_note = f" [{date_from or '...'} .. {date_to or '...'}]"
    print(f"  {len(rows)} posts to process{range_note}"
          f"{' (reprocessing all)' if reprocess else ''}")
    if not rows:
        return 0

    def _write_results(
        results: list[tuple],  # (json_str, pk)
    ) -> None:
        """Пишет в vk_post_model_result и обновляет vk_post.photo_species."""
        model_rows = [
            (pk, run_model, PHOTO_PROMPT_VERSION, species_json)
            for species_json, pk in results
        ]
        vk_rows = [
            (species_json, PHOTO_PROMPT_VERSION, pk)
            for species_json, pk in results
        ]
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO vk_post_model_result
                     (vk_post_id, model, prompt_version, photo_species)
                   VALUES (%s, %s, %s, %s::jsonb)
                   ON CONFLICT (vk_post_id, model)
                   DO UPDATE SET prompt_version = EXCLUDED.prompt_version,
                                 photo_species  = EXCLUDED.photo_species,
                                 processed_at   = now()""",
                model_rows,
            )
            cur.executemany(
                """UPDATE vk_post SET
                     photo_species = %s::jsonb,
                     photo_processed_at = now(),
                     photo_prompt_version = %s
                   WHERE id = %s""",
                vk_rows,
            )
        conn.commit()

    # Разделяем: сразу помечаем «пусто» либо отправляем модели
    skip_updates: list[tuple] = []
    to_process = []
    for pk, _post_id, date_ts, text, photo_urls in rows:
        empty = json.dumps([])
        if not photo_urls:
            skip_updates.append((empty, pk))
            continue
        if date_ts.month in WINTER_MONTHS:
            skip_updates.append((empty, pk))
            continue
        if text and SKIP_PHOTO_RE.search(text):
            skip_updates.append((empty, pk))
            continue
        to_process.append((pk, photo_urls))

    if skip_updates:
        _write_results(skip_updates)
        print(f"  {len(skip_updates)} posts skipped (winter / no photos / irrelevant)")

    print(f"  {len(to_process)} posts go to LM Studio")

    def process_one(pk: int, urls: list[str]) -> tuple[int, list[dict], str]:
        # Семплирование до 6 фото на пост, равномерно по индексам. Если фото
        # ≤ 6 — берём все. Раньше было ≤ 4, но на многофотных постах
        # пропускали виды, попавшие только в середину галереи.
        n = len(urls)
        MAX_PHOTOS = 6
        if n <= MAX_PHOTOS:
            sample_urls = list(urls)
        else:
            step = (n - 1) / (MAX_PHOTOS - 1)
            sample_urls = [urls[round(i * step)] for i in range(MAX_PHOTOS)]

        # Собираем результаты по фото в сыром виде (не сразу мерджим)
        per_photo: list[list[dict]] = []
        for url in sample_urls:
            img = _download_photo(url)
            if img is None:
                continue
            items = _ask_model(img, model=run_model)
            per_photo.append(items)

        # Scene-aware: если есть basket/kitchen фото — берём MAX (один такой
        # снимок = итоговая корзина); если только forest/other — суммируем
        # (walk-and-pick: каждое фото = отдельная находка).
        basket_counts: dict[str, int] = {}
        forest_counts: dict[str, list[int]] = {}
        n_photos_with_sp: dict[str, int] = {}

        for items in per_photo:
            # в рамках одного фото одно вхождение вида считаем один раз
            # даже если модель вернула два одинаковых (редко, но бывает)
            seen_here: dict[str, tuple[int, str]] = {}
            for it in items:
                sp = it.get("species", "")
                if not sp or sp == "none":
                    continue
                cnt = _normalize_count(it.get("count", 0))
                scene = (it.get("scene") or "other").lower()
                if sp not in seen_here or cnt > seen_here[sp][0]:
                    seen_here[sp] = (cnt, scene)
            for sp, (cnt, scene) in seen_here.items():
                n_photos_with_sp[sp] = n_photos_with_sp.get(sp, 0) + 1
                if scene in ("basket", "kitchen"):
                    basket_counts[sp] = max(basket_counts.get(sp, 0), cnt)
                else:
                    forest_counts.setdefault(sp, []).append(cnt)

        all_species = set(basket_counts) | set(forest_counts)
        result = []
        total_photos = len(per_photo) or 1
        for sp in all_species:
            if sp in basket_counts:
                total = basket_counts[sp]  # доверяем корзине, игнорируем forest shots
            else:
                total = sum(forest_counts.get(sp, []))  # разные находки → сумма
            result.append({
                "species": sp,
                "count": total,
                "n_photos": n_photos_with_sp.get(sp, 0),
                "photos_sampled": total_photos,
            })
        return pk, result

    # Чекпоинт каждые CHECKPOINT постов — если прервёшь Ctrl+C, прогресс
    # сохраняется (уже записанные (post, model) не будут процесситься при
    # рестарте благодаря WHERE NOT EXISTS).
    # Лог образца каждые LOG_EVERY постов — видно что реально находит модель.
    CHECKPOINT = 10

    total_updated = len(skip_updates)
    pending: list[tuple] = []
    done = 0

    with ThreadPoolExecutor(max_workers=n_workers) as ex:
        futures = {ex.submit(process_one, pk, urls): pk for pk, urls in to_process}
        try:
            for fut in tqdm(as_completed(futures), total=len(futures),
                            desc="photos", unit="post"):
                pk, result = fut.result()
                pending.append((json.dumps(result, ensure_ascii=False), pk))
                done += 1

                if len(pending) >= CHECKPOINT:
                    _write_results(pending)
                    total_updated += len(pending)
                    pending = []
        finally:
            if pending:
                _write_results(pending)
                total_updated += len(pending)
                pending = []

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

            for item in photo_species:
                photo_group = item.get("species", "")
                if photo_group in ("none", "", "other", "ошибка"):
                    continue
                slugs = GROUP_TO_SLUGS.get(photo_group, [])
                if not slugs:
                    continue
                cnt = item.get("count") or None

                # Quality вычисляется из доли фото где вид был виден.
                # Чем больше фото подтвердили вид — тем выше уверенность.
                n_seen = item.get("n_photos", 1)
                n_sampled = item.get("photos_sampled", 1)
                ratio = n_seen / max(n_sampled, 1)
                if ratio >= 0.5 or n_seen >= 2:
                    quality = "high"
                elif n_seen >= 1 and n_sampled <= 2:
                    quality = "ok"      # мало фото вообще, одного достаточно
                else:
                    quality = "low"     # 1 из 3+ фото — возможна ошибка модели

                for slug in slugs:
                    sp_id = slug_to_id.get(slug)
                    if sp_id is None:
                        continue
                    conn.execute(
                        """
                        INSERT INTO observation
                          (region_id, source, source_ref, source_version,
                           species_id, species_raw, observed_on,
                           count_estimate, quality, text_excerpt, meta)
                        VALUES (%s, 'vk', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (source, source_ref, species_id) DO NOTHING
                        """,
                        (
                            region_id, source_ref, source_version,
                            sp_id, photo_group, foray_date,
                            cnt, quality, text_excerpt,
                            json.dumps({
                                "photo_group": photo_group,
                                "vk_group": group,
                                "n_photos_with_sp": n_seen,
                                "photos_sampled": n_sampled,
                            }),
                        ),
                    )
                    n_inserted += 1

            # observation_written ставим в любом случае — мы честно попытались
            done_ids.append(vk_pk)

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
    ap.add_argument("--workers", type=int, default=5, help="параллельность LM Studio (Qwen3.5-9b loaded with Parallel=5)")
    ap.add_argument("--date-from", help="фильтр photos: ISO дата (YYYY-MM-DD), включая")
    ap.add_argument("--date-to",   help="фильтр photos: ISO дата (YYYY-MM-DD), исключая")
    ap.add_argument("--model",     help="переопределить LM_STUDIO_MODEL для этого прогона")
    ap.add_argument("--dsn", default=build_database_url())
    args = ap.parse_args()

    date_from = datetime.strptime(args.date_from, "%Y-%m-%d").date() if args.date_from else None
    date_to   = datetime.strptime(args.date_to,   "%Y-%m-%d").date() if args.date_to   else None

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
            photos_stage(conn, args.group, limit=args.limit,
                         n_workers=args.workers,
                         date_from=date_from, date_to=date_to,
                         model=args.model)
        if "promote" in run:
            print("\n── stage 4: promote → observation ──")
            promote_stage(conn, args.group, args.region)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
