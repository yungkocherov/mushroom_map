"""
probe_fgislk_id_range: определяет диапазон object_id выделов Ленобласти
в глобальном ID-space ФГИС.

Известно: object_id 109084231 = выдел 47:15:9:24:16 (Лужский, ЛО).
Region code 47:15 = Ленобласть. Надо понять начало и конец 47:15:*-блока
в ID-space, чтобы при bulk-скрапе не сканировать ID других регионов РФ.

Стратегия:
  1. Sweep — берём delta = ±10, ±100, ±1k, ±10k, ±100k, ±1M, ±10M
     от known ID. Для каждого делаем attributesinfo, парсим cadastral.
     Выводим mapping ID → cadastral.
  2. По результатам видно: ID плотно идут по ЛО (тогда найдём границы
     бинарным поиском) или ID-space перемешан с другими регионами.

Запуск: ▷ Run Python File
"""
from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar

KNOWN_ID = 109084231       # выдел 47:15:9:24:16 (Лужский ЛО)
LO_PREFIX = "47:15:"

ATTR_URL = (
    "https://pub.fgislk.gov.ru/map/geo/map_api/layer/attributesinfo"
    "?layer_code=TAXATION_PIECE&object_id={object_id}"
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)


def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


SSL_CTX = make_ssl_context()


def make_opener() -> urllib.request.OpenerDirector:
    """
    Opener с persistent cookie jar. Сначала идём на main page, забираем
    set-cookie (Yandex Metrica + любые WAF-cookies), потом используем
    их во всех запросах. ФГИС WAF, похоже, проверяет наличие cookie
    session и иначе возвращает empty-payload.
    """
    jar = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    opener.addheaders = [
        ("User-Agent", UA),
        ("Accept", "*/*"),
        ("Accept-Language", "ru,en;q=0.9"),
        ("Referer", "https://pub.fgislk.gov.ru/map/"),
    ]
    # Прогрев — получить cookies от main page
    try:
        opener.open("https://pub.fgislk.gov.ru/map/", timeout=10).read()
    except Exception as e:
        print(f"  warmup failed: {e}")
    print(f"  warmup cookies: {[(c.name, c.domain) for c in jar]}")
    return opener


OPENER = make_opener()


DEBUG_RAW = False  # ставится в True в начале step0 для печати первого raw response


def fetch_cadastral(object_id: int, *, timeout: float = 10.0) -> tuple[int, str | None]:
    """
    Returns (http_status, cadastral_number_or_None).
    cadastral_number examples: '47:15:9:24:16' (LO), '50:11:0:1:5' (Moscow), ...
    "" means empty payload (object doesn't exist).
    None means error.
    """
    url = ATTR_URL.format(object_id=object_id)
    try:
        with OPENER.open(url, timeout=timeout) as r:
            data = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return -1, None

    if DEBUG_RAW:
        print(f"\n--- raw {object_id} (HTTP {status}, {len(data)} bytes) ---")
        print(data.decode("utf-8", errors="replace")[:600])
        print("--- end raw ---\n")

    # Сервер отдаёт JSON с Accept: */*. Парсим как JSON.
    try:
        obj = json.loads(data)
    except Exception:
        return status, None

    payload = obj.get("payload") or {}
    if not payload:
        return status, ""  # пустой объект = ID не существует
    cad = payload.get("number")
    if cad:
        return status, cad
    return status, None  # есть payload но нет cadastral


# ─── Step 0: один запрос с raw-output для дебага ──────────────────────────
def step0_debug_raw() -> None:
    """Печатает raw XML known ID — чтобы убедиться что парсер видит number."""
    global DEBUG_RAW
    print("=" * 70)
    print("Step 0: raw response for known ID (debug)")
    print("=" * 70)
    DEBUG_RAW = True
    fetch_cadastral(KNOWN_ID)
    DEBUG_RAW = False
    print()


# ─── Step 1: spread sample ────────────────────────────────────────────────
def step1_spread() -> None:
    print("=" * 70)
    print("Step 1: Sample IDs at varying distance from known LO ID")
    print(f"        Known: {KNOWN_ID} -> 47:15:9:24:16 (Лужский, ЛО)")
    print("=" * 70)
    deltas = [
        -10_000_000, -1_000_000, -100_000, -10_000, -1_000, -100, -10, -1,
        +1, +10, +100, +1_000, +10_000, +100_000, +1_000_000, +10_000_000,
    ]
    targets = [KNOWN_ID + d for d in deltas]
    results: dict[int, tuple[int, str | None]] = {}

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_cadastral, oid): oid for oid in targets}
        for f in as_completed(futures):
            oid = futures[f]
            results[oid] = f.result()

    lo_count = 0
    for oid in targets:
        delta = oid - KNOWN_ID
        status, cad = results[oid]
        marker = ""
        if cad and cad.startswith(LO_PREFIX):
            marker = "  <-- LO"
            lo_count += 1
        elif cad == "":
            marker = "  (empty payload)"
        elif cad is None:
            marker = "  (no cadastral)"
        print(f"  delta={delta:>+12,d}  id={oid:>11d}  HTTP {status}  cadastral={cad!r}{marker}")
    print()
    print(f"  LO hits: {lo_count} / {len(targets)}")
    print()


# ─── Step 2: dense scan in ±delta vicinity ────────────────────────────────
def step2_dense(delta_max: int = 1000, step: int = 10) -> None:
    print("=" * 70)
    print(f"Step 2: Dense scan {delta_max} IDs around known, step {step}")
    print(f"        Goal — confirm 47:15:* IDs are contiguous (or gappy)")
    print("=" * 70)
    targets = list(range(KNOWN_ID - delta_max, KNOWN_ID + delta_max + 1, step))
    results: dict[int, tuple[int, str | None]] = {}

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(fetch_cadastral, oid): oid for oid in targets}
        for f in as_completed(futures):
            oid = futures[f]
            results[oid] = f.result()
    dt = time.time() - t0

    by_prefix: dict[str, int] = {}
    for oid in targets:
        status, cad = results[oid]
        if cad and ":" in cad:
            prefix = ":".join(cad.split(":")[:2])  # "47:15"
            by_prefix[prefix] = by_prefix.get(prefix, 0) + 1
        elif cad == "":
            by_prefix["(empty)"] = by_prefix.get("(empty)", 0) + 1
        else:
            by_prefix["(other)"] = by_prefix.get("(other)", 0) + 1

    print(f"  Scanned {len(targets)} IDs in {dt:.1f}s ({len(targets) / dt:.1f}/s)")
    print(f"  Region distribution:")
    for prefix, n in sorted(by_prefix.items(), key=lambda kv: -kv[1]):
        share = 100 * n / len(targets)
        print(f"    {prefix:15s}  {n:>4d}  ({share:5.1f}%)")
    print()


# ─── Step 3: binary search for LO range boundaries ────────────────────────
def is_lo(object_id: int) -> bool:
    _, cad = fetch_cadastral(object_id)
    return cad is not None and cad.startswith(LO_PREFIX)


def step3_binary_search() -> None:
    """
    Если в Step 2 видим что вокруг known ID идут >50% LO — значит ID
    плотные, ищем границы биссекцией. Иначе пропускаем.
    """
    print("=" * 70)
    print("Step 3: Binary search for LO range start/end")
    print("=" * 70)

    # Поиск максимума: двигаемся вверх пока находим LO
    print("  Forward search (looking for LAST consecutive LO id)...")
    lo, hi = KNOWN_ID, KNOWN_ID + 100_000_000
    # First grow until we miss LO
    last_lo = KNOWN_ID
    cursor = KNOWN_ID
    step = 100_000
    misses = 0
    while step >= 100 and misses < 5:
        cursor += step
        hit = is_lo(cursor)
        marker = "LO" if hit else "not"
        print(f"    cursor={cursor:>12,d}  step={step:>10,d}  {marker}")
        if hit:
            last_lo = cursor
            misses = 0
        else:
            cursor -= step
            step //= 10
            misses += 1
    print(f"  Approximate MAX LO id: ~{last_lo:,d}")
    print()

    print("  Backward search (looking for FIRST consecutive LO id)...")
    first_lo = KNOWN_ID
    cursor = KNOWN_ID
    step = 100_000
    misses = 0
    while step >= 100 and misses < 5:
        cursor -= step
        hit = is_lo(cursor)
        marker = "LO" if hit else "not"
        print(f"    cursor={cursor:>12,d}  step={step:>10,d}  {marker}")
        if hit:
            first_lo = cursor
            misses = 0
        else:
            cursor += step
            step //= 10
            misses += 1
    print(f"  Approximate MIN LO id: ~{first_lo:,d}")
    print()
    print(f"  Range estimate: {first_lo:,d} ... {last_lo:,d}")
    print(f"  Span: {last_lo - first_lo:,d} IDs")


if __name__ == "__main__":
    step0_debug_raw()
    step1_spread()
    step2_dense(delta_max=1000, step=10)
    print()
    print("[Step 3 будет полезен только если Step 2 показал плотность LO.")
    print("Если LO ID разбросаны — другая стратегия нужна.]")
    print()
    step3_binary_search()
