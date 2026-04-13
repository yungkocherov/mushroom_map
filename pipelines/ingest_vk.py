"""
VK → observation pipeline.

Стадии:
  1. collect  — скачать посты из ВК (wall.get)
  2. dates    — извлечь дату похода из текста (regex + опционально LLM)
  3. photos   — распознать виды грибов на фото через Gemma (LM Studio)
  4. db       — записать в таблицу observation (psycopg)

Запуск:
  python pipelines/ingest_vk.py --group grib_spb --region lenoblast
  python pipelines/ingest_vk.py --group grib_spb --region lenoblast --from photos
  python pipelines/ingest_vk.py --group grib_spb --region lenoblast --step db

Переменные окружения (из .env):
  VK_TOKEN          — токен ВК API
  DATABASE_URL      — postgresql://...
  LM_STUDIO_URL     — http://127.0.0.1:1234/v1/chat/completions  (по умолчанию)
  LM_STUDIO_MODEL   — google/gemma-3-12b  (по умолчанию)
  ANTHROPIC_API_KEY — опционально, для LLM-фоллбэка при извлечении дат
"""

from __future__ import annotations

import argparse
import base64
import csv
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

# ─── Конфигурация ────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env")

VK_TOKEN       = os.getenv("VK_TOKEN", "")
LM_STUDIO_URL  = os.getenv("LM_STUDIO_URL",
                            "http://127.0.0.1:1234/v1/chat/completions")
LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "google/gemma-3-12b")

# DATABASE_URL: берём из env или собираем из частей (поддерживает POSTGRES_PORT=5433)
def _build_database_url() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    user   = os.getenv("POSTGRES_USER",     "mushroom")
    pw     = os.getenv("POSTGRES_PASSWORD", "mushroom_dev")
    host   = os.getenv("POSTGRES_HOST",     "127.0.0.1")
    port   = os.getenv("POSTGRES_PORT",     "5434")
    db     = os.getenv("POSTGRES_DB",       "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"

DATABASE_URL = _build_database_url()

VK_API_VERSION = "5.131"
VK_BATCH_SIZE  = 100
VK_DELAY       = 0.35          # секунды между запросами
CHECKPOINT_EVERY = 500         # постов до сохранения checkpoint

YEARS_BACK = 8                 # сколько лет истории брать

# Рабочая папка для промежуточных файлов: data/vk/{group}/
DATA_ROOT = Path(__file__).parent.parent / "data" / "vk"

# ─── Маппинг: группа на фото → species slug в БД ─────────────────────────────
#
# Для каждой фотогруппы выбран главный представитель — самый часто встречающийся
# в Ленобласти вид. При расширении справочника species можно добавить больше slug'ов
# в список и pipeline запишет отдельное наблюдение для каждого.

GROUP_TO_SLUGS: dict[str, list[str]] = {
    "chanterelle":  ["cantharellus-cibarius"],
    "bolete":       ["boletus-edulis", "leccinum-scabrum", "leccinum-aurantiacum"],
    "honey_fungus": ["armillaria-mellea"],
    "morel":        ["morchella-esculenta"],
    "russula":      ["russula-vesca"],
    "lactarius":    ["lactarius-deliciosus", "lactarius-resimus", "lactarius-torminosus"],
    "amanita":      ["amanita-muscaria"],
    "parasol":      ["macrolepiota-procera"],
    # "other" и "none" — не записываем
}

# ─── Фильтр нерелевантных постов ─────────────────────────────────────────────

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

SKIP_DATE_RE = re.compile("|".join([
    r"архив",
    r"с\s+днём?\s+рождени|день\s+рождени|\bдр\b|поздравля",
    r"с\s+новым\s+год|новогодн",
    r"8\s*марта|23\s*февраля|день\s+защитника",
]), re.IGNORECASE)

# ─── Промпт для распознавания видов ──────────────────────────────────────────

CLASSIFY_PROMPT = """Classify mushrooms in this photo. JSON only: [{"species":"group","count":N}]
No mushrooms or unrelated photo: [{"species":"none","count":0}]
Basket=30-50, handful=5-10.

Groups:
- chanterelle (Cantharellus, Craterellus - golden/yellow funnel-shaped, false gills)
- bolete (Boletus, Leccinum, Suillus, Xerocomus, Imleria - sponge/tubes under cap)
- honey_fungus (Armillaria, Kuehneromyces - small, clusters on wood or roots, ring on stem)
- morel (Morchella, Gyromitra - wrinkled/brain-like cap, spring mushrooms)
- russula (Russula - brittle, colorful caps, white stem, no ring, no volva)
- lactarius (Lactarius - milk caps: рыжики/saffron milk, грузди/white milk, волнушки/woolly milk)
- amanita (Amanita - ring AND volva/cup at base: fly agaric, death cap, destroying angel)
- parasol (Macrolepiota - very large, parasol-shaped, brown scaly cap, movable ring)
- other (any mushroom not matching above groups)
- none (no mushrooms, recipe photo, forest landscape, berries, etc.)"""

# ─── Русские названия месяцев для парсинга дат ───────────────────────────────

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


# ═══════════════════════════════════════════════════════════════════════════════
# СТАДИЯ 1: СБОР ПОСТОВ
# ═══════════════════════════════════════════════════════════════════════════════

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
            print(f"\nСетевая ошибка (попытка {attempt+1}/{retries}), ждём {wait}с: {e}")
            time.sleep(wait)


def collect_posts(group: str, data_dir: Path) -> list[dict]:
    """Скачивает посты из VK группы. Возвращает список постов."""
    checkpoint_file = data_dir / "checkpoint.json"
    out_json = data_dir / "raw_posts.json"

    # Загружаем checkpoint если есть
    if checkpoint_file.exists():
        with open(checkpoint_file, encoding="utf-8") as f:
            saved = json.load(f)
        posts, offset = saved["posts"], saved["offset"]
        print(f"Найден checkpoint: {len(posts)} постов, offset={offset}")
    else:
        posts, offset = [], 0

    # Вычисляем cutoff timestamp
    cutoff_dt = datetime.now(tz=timezone.utc).replace(
        year=datetime.now().year - YEARS_BACK
    )
    cutoff_ts = int(cutoff_dt.timestamp())

    # Общее число постов
    total = vk_request("wall.get", {"domain": group, "count": 1, "filter": "owner"})["count"]
    print(f"[{group}] Постов в группе: {total}, забираем с {cutoff_dt.strftime('%Y-%m-%d')}")

    stopped_early = False
    last_cp_size = len(posts)

    try:
        with tqdm(total=total, initial=offset, desc="Посты", unit="пост") as pbar:
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

                for post in batch:
                    if post["date"] < cutoff_ts:
                        stopped_early = True
                        break
                    posts.append({
                        "id": post["id"],
                        "date_ts": post["date"],
                        "date_posted": datetime.fromtimestamp(
                            post["date"], tz=timezone.utc
                        ).strftime("%Y-%m-%d"),
                        "text": post.get("text", ""),
                        "likes": post.get("likes", {}).get("count", 0),
                        "reposts": post.get("reposts", {}).get("count", 0),
                        "views": post.get("views", {}).get("count", 0),
                        "photos": sum(
                            1 for a in post.get("attachments", [])
                            if a.get("type") == "photo"
                        ),
                        "photo_urls": [
                            max(
                                a["photo"]["sizes"],
                                key=lambda s: s["width"] * s["height"]
                            )["url"]
                            for a in post.get("attachments", [])
                            if a.get("type") == "photo"
                            and a.get("photo", {}).get("sizes")
                        ],
                    })

                pbar.update(len(batch))
                offset += len(batch)

                if len(posts) - last_cp_size >= CHECKPOINT_EVERY:
                    data_dir.mkdir(parents=True, exist_ok=True)
                    with open(checkpoint_file, "w", encoding="utf-8") as f:
                        json.dump({"posts": posts, "offset": offset}, f, ensure_ascii=False)
                    last_cp_size = len(posts)

                if stopped_early or offset >= total:
                    break

                time.sleep(VK_DELAY)

    except Exception:
        if posts:
            data_dir.mkdir(parents=True, exist_ok=True)
            with open(checkpoint_file, "w", encoding="utf-8") as f:
                json.dump({"posts": posts, "offset": offset}, f, ensure_ascii=False)
        raise

    if checkpoint_file.exists():
        checkpoint_file.unlink()

    print(f"\nСобрано постов: {len(posts)}")
    data_dir.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"Сохранено: {out_json}")
    return posts


# ═══════════════════════════════════════════════════════════════════════════════
# СТАДИЯ 2: ИЗВЛЕЧЕНИЕ ДАТ
# ═══════════════════════════════════════════════════════════════════════════════

def _month_num(word: str) -> Optional[int]:
    word = word.lower()
    for prefix, num in MONTHS_RU.items():
        if word.startswith(prefix):
            return num
    return None


def parse_date_regex(text: str, post_date: str) -> Optional[str]:
    """Извлекает дату похода из текста поста. Возвращает YYYY-MM-DD или None."""
    post_dt = datetime.strptime(post_date, "%Y-%m-%d").date()
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
                return date(year, month, day).isoformat()
            except ValueError:
                pass

    # Диапазон "27-28.01.26"
    m = re.search(r"(\d{1,2})-\d{1,2}\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})г?", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        if 1 <= month <= 12 and 1 <= day <= 31:
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                pass

    # DD.MM без года
    m = re.search(r"\b(\d{1,2})[./\\](\d{1,2})\b", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        looks_like_time = (day <= 23 and month <= 59 and month > 12)
        if not looks_like_time and 1 <= month <= 12 and 1 <= day <= 31:
            year = post_dt.year
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d.isoformat()
            except ValueError:
                pass

    # DD месяц YYYY
    pattern_dmy = rf"\b(\d{{1,2}})\s+{MONTHS_RU_PATTERN}(?:\s+(\d{{4}}))?"
    m = re.search(pattern_dmy, text_lower)
    if m:
        day = int(m.group(1))
        month = _month_num(m.group(2))
        year_str = m.group(3)
        year = int(year_str) if year_str else post_dt.year
        if month:
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d.isoformat()
            except ValueError:
                pass

    # месяц DD
    pattern_mdy = rf"{MONTHS_RU_PATTERN}\s+(\d{{1,2}})(?:\s+(\d{{4}}))?"
    m = re.search(pattern_mdy, text_lower)
    if m:
        month = _month_num(m.group(1))
        day = int(m.group(2))
        year_str = m.group(3)
        year = int(year_str) if year_str else post_dt.year
        if month:
            try:
                d = date(year, month, day)
                if d > post_dt:
                    d = date(year - 1, month, day)
                return d.isoformat()
            except ValueError:
                pass

    # День недели
    WEEKDAYS_RU = {
        "понедельник": 0, "вторник": 1, "среду": 2, "среда": 2,
        "четверг": 3, "пятницу": 4, "пятница": 4,
        "субботу": 5, "суббота": 5, "воскресенье": 6,
    }
    m = re.search(r"\bв\s+(" + "|".join(WEEKDAYS_RU) + r")\b", text_lower)
    if m:
        target_wd = WEEKDAYS_RU[m.group(1)]
        days_back = (post_dt.weekday() - target_wd) % 7
        if days_back == 0:
            days_back = 7
        if days_back <= 14:
            return (post_dt - timedelta(days=days_back)).isoformat()

    # Относительные
    if re.search(r"\bсегодня\b", text_lower):
        return post_dt.isoformat()
    if re.search(r"\bвчера\b", text_lower):
        return (post_dt - timedelta(days=1)).isoformat()
    if re.search(r"\bпозавчера\b", text_lower):
        return (post_dt - timedelta(days=2)).isoformat()

    return None


def parse_date_llm(text: str, post_date: str) -> Optional[str]:
    """Claude-фоллбэк для извлечения даты. Используется только при --llm."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        prompt = (
            f"Вот текст поста грибников. Дата публикации: {post_date}.\n"
            "Определи дату похода за грибами (не дата публикации).\n"
            "Ответь ТОЛЬКО датой YYYY-MM-DD. Если дата не указана — UNKNOWN.\n\n"
            f"Текст:\n{text[:800]}"
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}],
        )
        result = msg.content[0].text.strip()
        datetime.strptime(result, "%Y-%m-%d")
        return result
    except Exception:
        return None


def extract_dates(posts: list[dict], data_dir: Path, use_llm: bool = False) -> list[dict]:
    """Извлекает даты походов. Возвращает список записей с foray_date."""
    out_csv = data_dir / "posts_with_dates.csv"

    results = []
    llm_count = 0
    no_date_count = 0
    skipped_count = 0

    for post in tqdm(posts, desc="Даты"):
        post_date = post["date_posted"]
        text = post["text"]

        if not text.strip():
            source = "no_text"
            foray_date = None
        elif SKIP_DATE_RE.search(text):
            source = "skipped"
            foray_date = None
            skipped_count += 1
        else:
            foray_date = parse_date_regex(text, post_date)
            source = "regex" if foray_date else None

            if foray_date is None and use_llm:
                foray_date = parse_date_llm(text, post_date)
                if foray_date:
                    source = "llm"
                    llm_count += 1

            if foray_date is None:
                source = "not_found"
                no_date_count += 1

        results.append({
            "id": post["id"],
            "date_posted": post_date,
            "foray_date": foray_date or "",
            "date_source": source,
            "likes": post["likes"],
            "views": post.get("views", 0),
            "photos": post["photos"],
            "text_preview": text[:200].replace("\n", " "),
        })

    found = sum(1 for r in results if r["foray_date"])
    relevant = len(posts) - skipped_count
    print(f"\nВсего: {len(posts)} | Найдено дат: {found} | "
          f"Regex: {found - llm_count} | LLM: {llm_count} | "
          f"Не найдено: {no_date_count} | "
          f"Покрытие: {found/max(relevant,1)*100:.1f}%")

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)
    print(f"Сохранено: {out_csv}")
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# СТАДИЯ 3: РАСПОЗНАВАНИЕ ВИДОВ ПО ФОТО
# ═══════════════════════════════════════════════════════════════════════════════

def _download_photo(url: str, timeout: int = 15) -> Optional[bytes]:
    try:
        resp = requests.get(url, timeout=timeout)
        if resp.status_code == 200 and len(resp.content) > 1000:
            return resp.content
        return None
    except Exception:
        return None


def _ask_model(image_bytes: bytes) -> list:
    """Отправляет фото в LM Studio, возвращает список {species, count}."""
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
        # Фиксим диапазоны: "count": 30-50 → строка
        text = re.sub(r'"count"\s*:\s*(\d+)\s*-\s*(\d+)', r'"count": "\1-\2"', text)

        json_match = re.search(r"\[.*?\]", text, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
        return []
    except Exception as e:
        print(f"  Ошибка модели: {e}")
        return []


def _normalize_count(cnt) -> int:
    if isinstance(cnt, str) and "-" in cnt:
        parts = cnt.split("-")
        try:
            return min((int(parts[0]) + int(parts[1])) // 2, 150)
        except (ValueError, IndexError):
            return 0
    try:
        return min(int(cnt), 150)
    except (ValueError, TypeError):
        return 0


def classify_photos(posts: list[dict], data_dir: Path) -> dict[str, list[dict]]:
    """
    Классифицирует грибы на фото через LM Studio (Gemma).
    Возвращает dict[post_id -> список {species, count}].
    Пропускает зиму, нерелевантные по тексту посты.
    """
    out_checkpoint = data_dir / "photo_species_checkpoint.json"
    out_csv = data_dir / "photo_species.csv"

    WINTER_MONTHS = {11, 12, 1, 2, 3}

    to_process = []
    for p in posts:
        urls = p.get("photo_urls", [])
        if not urls:
            continue
        post_month = datetime.strptime(p["date_posted"], "%Y-%m-%d").month
        if post_month in WINTER_MONTHS:
            continue
        text = p.get("text", "")
        if text and SKIP_PHOTO_RE.search(text):
            continue
        to_process.append({
            "id": str(p["id"]),
            "urls": [urls[0]] if len(urls) == 1 else [urls[0], urls[-1]],
            "month": post_month,
        })

    # Проверяем LM Studio
    try:
        base_url = LM_STUDIO_URL.rsplit("/chat/completions", 1)[0]
        requests.get(f"{base_url}/models", timeout=5)
        print(f"LM Studio доступна: {LM_STUDIO_URL}")
        print(f"Модель: {LM_STUDIO_MODEL}")
    except Exception:
        print("LM Studio не запущена! Запусти сервер и укажи LM_STUDIO_URL в .env.")
        print(f"  Ожидаемый URL: {LM_STUDIO_URL}")
        sys.exit(1)

    # Загружаем checkpoint
    results: dict[str, list[dict]] = {}
    if out_checkpoint.exists():
        with open(out_checkpoint, encoding="utf-8") as f:
            results = json.load(f)
        print(f"Checkpoint: {len(results)} постов обработано")

    remaining = [p for p in to_process if p["id"] not in results]
    print(f"Постов с фото (апр-окт, релевантные): {len(to_process)}")
    print(f"Осталось обработать: {len(remaining)}")

    if not remaining:
        print("Все посты обработаны!")
    else:
        import threading
        last_lock = threading.Lock()
        last_answer = {"text": ""}

        def process_one(post: dict) -> tuple[str, list[dict]]:
            combined: dict[str, int] = {}
            for url in post["urls"]:
                img = _download_photo(url)
                if img is None:
                    continue
                items = _ask_model(img)
                with last_lock:
                    last_answer["text"] = str(items)[:100]
                for item in items:
                    sp = item.get("species", "")
                    cnt = _normalize_count(item.get("count", 0))
                    combined[sp] = max(combined.get(sp, 0), cnt)
            if not combined:
                return post["id"], []
            return post["id"], [{"species": sp, "count": cnt}
                                  for sp, cnt in combined.items()]

        N_WORKERS = 4
        BATCH = 100
        pbar = tqdm(total=len(remaining), desc="Фото")

        for batch_start in range(0, len(remaining), BATCH):
            batch = remaining[batch_start:batch_start + BATCH]
            with ThreadPoolExecutor(max_workers=N_WORKERS) as ex:
                futures = {ex.submit(process_one, p): p for p in batch}
                for future in as_completed(futures):
                    pid, result = future.result()
                    results[pid] = result
                    pbar.update(1)
                    if pbar.n % 20 == 0:
                        with last_lock:
                            tqdm.write(f"  >> {last_answer['text']}")

            with open(out_checkpoint, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False)

        pbar.close()

    # Сохраняем CSV
    rows = []
    for pid, items in results.items():
        for item in items:
            sp = item.get("species", "")
            if sp in ("none", "ошибка", ""):
                continue
            rows.append({
                "id": pid,
                "photo_species": sp,
                "photo_count": item.get("count", 0),
            })

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "photo_species", "photo_count"])
        writer.writeheader()
        writer.writerows(rows)

    species_count: dict[str, int] = {}
    for r in rows:
        sp = r["photo_species"]
        species_count[sp] = species_count.get(sp, 0) + 1
    print(f"\nСохранено: {out_csv} ({len(rows)} записей)")
    print("Виды по фото:")
    for sp, cnt in sorted(species_count.items(), key=lambda x: -x[1]):
        print(f"  {sp:20s} {cnt:6d}")

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# СТАДИЯ 4: ЗАПИСЬ В БД
# ═══════════════════════════════════════════════════════════════════════════════

def write_to_db(
    group: str,
    region_code: str,
    posts: list[dict],
    date_results: list[dict],
    photo_results: dict[str, list[dict]],
    data_dir: Path,
) -> None:
    """Записывает наблюдения в таблицу observation."""

    # Индекс: post_id → foray_date
    date_by_id: dict[str, str] = {
        str(r["id"]): r["foray_date"]
        for r in date_results
        if r.get("foray_date")
    }

    # Версия для дедупликации при повторных прогонах
    source_version = f"vk-{group}-{datetime.now().strftime('%Y-%m-%d')}"

    print(f"\nЗаписываем в БД: {DATABASE_URL[:50]}...")
    conn = psycopg.connect(DATABASE_URL)

    try:
        # Получаем region_id
        row = conn.execute(
            "SELECT id FROM region WHERE code = %s", (region_code,)
        ).fetchone()
        if row is None:
            print(f"Регион '{region_code}' не найден в БД!")
            print("Доступные регионы:")
            for r in conn.execute("SELECT code, name_ru FROM region").fetchall():
                print(f"  {r[0]} — {r[1]}")
            sys.exit(1)
        region_id = row[0]
        print(f"Регион: {region_code} (id={region_id})")

        # Получаем species_id по slug
        slug_to_id: dict[str, int] = {}
        for slug_row in conn.execute("SELECT id, slug FROM species").fetchall():
            slug_to_id[slug_row[1]] = slug_row[0]
        print(f"Видов в БД: {len(slug_to_id)}")

        # Считаем сколько уже есть наблюдений с этой версией
        existing_count = conn.execute(
            "SELECT COUNT(*) FROM observation WHERE source = 'vk' AND source_version = %s",
            (source_version,)
        ).fetchone()[0]
        if existing_count > 0:
            print(f"Уже есть {existing_count} наблюдений версии {source_version}, пропускаем.")
            return

        # Собираем строки для вставки
        post_by_id = {str(p["id"]): p for p in posts}
        n_inserted = 0
        n_skipped_no_date = 0
        n_skipped_no_species = 0
        n_skipped_unknown_slug = 0

        with conn.transaction():
            for post_id, photo_items in photo_results.items():
                if not photo_items:
                    continue

                foray_date = date_by_id.get(post_id)
                if not foray_date:
                    # Нет даты — используем дату публикации как fallback
                    post = post_by_id.get(post_id)
                    if post:
                        foray_date = post["date_posted"]
                    else:
                        n_skipped_no_date += 1
                        continue

                post = post_by_id.get(post_id)
                text_excerpt = post["text"][:300] if post else ""
                source_ref = f"{group}-{post_id}"

                for item in photo_items:
                    photo_group = item.get("species", "")
                    if photo_group in ("none", "ошибка", ""):
                        n_skipped_no_species += 1
                        continue

                    slugs = GROUP_TO_SLUGS.get(photo_group, [])
                    if not slugs:
                        # "other" → пропускаем (нет подходящего вида в справочнике)
                        n_skipped_unknown_slug += 1
                        continue

                    count_estimate = item.get("count", 0) or None

                    for slug in slugs:
                        species_id = slug_to_id.get(slug)
                        if species_id is None:
                            n_skipped_unknown_slug += 1
                            continue

                        try:
                            conn.execute(
                                """
                                INSERT INTO observation (
                                    region_id, source, source_ref, source_version,
                                    species_id, species_raw,
                                    observed_on, count_estimate,
                                    text_excerpt, meta
                                )
                                VALUES (%s, 'vk', %s, %s, %s, %s, %s, %s, %s, %s)
                                ON CONFLICT (source, source_ref, species_id) DO NOTHING
                                """,
                                (
                                    region_id,
                                    source_ref,
                                    source_version,
                                    species_id,
                                    photo_group,           # species_raw = photo group name
                                    foray_date,
                                    count_estimate,
                                    text_excerpt,
                                    json.dumps({"photo_group": photo_group,
                                                "vk_group": group}),
                                ),
                            )
                            n_inserted += 1
                        except Exception as e:
                            print(f"  Ошибка вставки post={post_id} slug={slug}: {e}")

        print(f"\n✅ Вставлено: {n_inserted}")
        print(f"   Пропущено (нет даты):   {n_skipped_no_date}")
        print(f"   Пропущено (нет вида):   {n_skipped_no_species}")
        print(f"   Пропущено (нет slug):   {n_skipped_unknown_slug}")

        # Обновляем материализованные представления
        print("\nОбновляем материализованные представления...")
        conn.execute(
            "REFRESH MATERIALIZED VIEW observation_region_species_stats"
        )
        # H3-агрегацию тоже обновляем (она может быть пустой если нет h3_cell)
        conn.execute(
            "REFRESH MATERIALIZED VIEW observation_h3_species_stats"
        )
        conn.commit()
        print("✅ Готово!")

    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# ТОЧКА ВХОДА
# ═══════════════════════════════════════════════════════════════════════════════

STEPS = ["collect", "dates", "photos", "db"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="VK -> observation pipeline dla gribnoj karty"
    )
    parser.add_argument(
        "--group", default="grib_spb",
        help="VK-группа (domain или id), по умолчанию grib_spb"
    )
    parser.add_argument(
        "--region", default="lenoblast",
        help="Код региона в БД (lenoblast / spb / ...), по умолчанию lenoblast"
    )
    parser.add_argument(
        "--step", choices=STEPS,
        help="Запустить только одну стадию"
    )
    parser.add_argument(
        "--from", dest="from_step", choices=STEPS,
        help="Начать с этой стадии (включительно), используя уже скачанные данные"
    )
    parser.add_argument(
        "--llm", action="store_true",
        help="Использовать Claude как fallback для извлечения дат"
    )
    args = parser.parse_args()

    if not VK_TOKEN and (args.step in (None, "collect") or args.from_step in (None, "collect")):
        print("Ошибка: VK_TOKEN не задан в .env")
        sys.exit(1)

    data_dir = DATA_ROOT / args.group
    data_dir.mkdir(parents=True, exist_ok=True)

    raw_json = data_dir / "raw_posts.json"
    dates_csv = data_dir / "posts_with_dates.csv"

    # Определяем какие стадии запускать
    if args.step:
        run_steps = {args.step}
    elif args.from_step:
        run_steps = set(STEPS[STEPS.index(args.from_step):])
    else:
        run_steps = set(STEPS)

    posts: list[dict] = []
    date_results: list[dict] = []
    photo_results: dict[str, list[dict]] = {}

    # ── Стадия 1: Сбор постов ─────────────────────────────────────────────────
    if "collect" in run_steps:
        print("=" * 60)
        print(f"СТАДИЯ 1: Сбор постов [{args.group}]")
        print("=" * 60)
        posts = collect_posts(args.group, data_dir)
    elif raw_json.exists():
        with open(raw_json, encoding="utf-8") as f:
            posts = json.load(f)
        print(f"Загружено {len(posts)} постов из {raw_json}")
    else:
        print(f"Файл {raw_json} не найден. Запусти без --from или с --step collect")
        sys.exit(1)

    # ── Стадия 2: Извлечение дат ─────────────────────────────────────────────
    if "dates" in run_steps:
        print("\n" + "=" * 60)
        print(f"СТАДИЯ 2: Извлечение дат")
        print("=" * 60)
        date_results = extract_dates(posts, data_dir, use_llm=args.llm)
    elif dates_csv.exists():
        with open(dates_csv, encoding="utf-8") as f:
            date_results = list(csv.DictReader(f))
        print(f"Загружено {len(date_results)} записей из {dates_csv}")
    elif "photos" in run_steps or "db" in run_steps:
        print(f"Файл {dates_csv} не найден. Запусти --from dates")
        sys.exit(1)

    # ── Стадия 3: Распознавание фото ─────────────────────────────────────────
    if "photos" in run_steps:
        print("\n" + "=" * 60)
        print(f"СТАДИЯ 3: Распознавание видов по фото")
        print("=" * 60)
        photo_results = classify_photos(posts, data_dir)
    elif (data_dir / "photo_species_checkpoint.json").exists():
        with open(data_dir / "photo_species_checkpoint.json", encoding="utf-8") as f:
            photo_results = json.load(f)
        print(f"Загружено {len(photo_results)} результатов из checkpoint")
    elif "db" in run_steps:
        print("Нет результатов классификации. Запусти --from photos")
        sys.exit(1)

    # ── Стадия 4: Запись в БД ────────────────────────────────────────────────
    if "db" in run_steps:
        print("\n" + "=" * 60)
        print(f"СТАДИЯ 4: Запись в БД (регион: {args.region})")
        print("=" * 60)
        write_to_db(args.group, args.region, posts, date_results, photo_results, data_dir)


if __name__ == "__main__":
    main()
