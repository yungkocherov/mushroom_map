"""
scrape_fgislk_attrinfo: bulk-скрейпер выделов ЛО через ФГИС API
по object_id enumeration.

Преимущества над старым MVT-скрапом:
  1. Покрытие 100% выделов в ID-блоке (MVT отдавал subset ~70%).
  2. Точная геометрия (Polygon, не упрощённая рендер-tolerance).
  3. Все properties: tree_species, yield_class, age_group, square,
     taxation_date, timber_stock, event, cadastral (`number`).

Стратегия:
  - Для каждого object_id в диапазоне:
      a) GET attributesinfo  -> JSON с properties
      b) Если payload пустой или number не начинается с region_prefix - skip
         (default = "47:" — весь субъект ЛО, любой кадастровый район;
          раньше фильтр был слишком узкий "47:15:" — отбрасывал данные
          из других кадастровых районов ЛО, см. memory project_fgislk_47x14)
      c) GET boundingbox     -> bbox EPSG:3857 (rectangle)
      d) POST WMS GetFeatureInfo в центр bbox -> Polygon EPSG:3857
      e) Reproject Polygon в EPSG:4326, save в GeoJSON

Resume:
  Прогресс в SQLite (data/rosleshoz/fgislk_attrinfo_progress.db).
  Каждый успешно обработанный ID + результат там же. Retry/restart
  начнёт с последнего необработанного.

Запуск:
  .venv/Scripts/python.exe pipelines/scrape_fgislk_attrinfo.py \\
      --start 109022831 --end 109118831 \\
      --region-prefix 47:15: \\
      --workers 20 \\
      --out data/rosleshoz/fgislk_attrinfo.geojson
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar
from pathlib import Path

ATTR_URL = "https://pub.fgislk.gov.ru/map/geo/map_api/layer/attributesinfo"
BBOX_URL = "https://pub.fgislk.gov.ru/map/geo/map_api/layer/boundingbox"
WMS_URL = "https://pub.fgislk.gov.ru/map/geo/geoserver/wms"
LAYER_CODE = "TAXATION_PIECE"
QUERY_LAYERS = "FOREST_LAYERS:TAXATION_PIECE"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)


# ─── HTTP plumbing ────────────────────────────────────────────────────────
def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


SSL_CTX = make_ssl_context()


def make_opener() -> urllib.request.OpenerDirector:
    jar = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    opener.addheaders = [
        ("User-Agent", UA),
        # 2026-05-04: ФГИС attributesinfo контент-негоциирует и при
        # `Accept: */*` отдаёт ИНОГДА JSON, ИНОГДА XML (видимо разные
        # backend'ы за load-balancer'ом). XML-ответ ломал json.loads и
        # ID помечался как 'wrong_region' (или 'empty', если retry'и
        # тоже попадали на XML). Жёстко фиксируем JSON; в http_get_json
        # есть XML-fallback на случай если сервер игнорирует Accept.
        ("Accept", "application/json, */*;q=0.5"),
        ("Accept-Language", "ru,en;q=0.9"),
        ("Referer", "https://pub.fgislk.gov.ru/map/"),
    ]
    try:
        opener.open("https://pub.fgislk.gov.ru/map/", timeout=10).read()
    except Exception:
        pass
    return opener


OPENER = make_opener()


def _parse_xml_responsewrapper(data: bytes) -> dict | None:
    """Парсит XML-формат ФГИС attributesinfo:

        <ResponseWrapper>
          <payload>
            <number>47:15:9:125:5</number>
            <square>11.2</square>
            ...
          </payload>
        </ResponseWrapper>

    Возвращает dict с тем же shape, что и JSON-вариант:
    `{"payload": {"number": ..., ...}}`.
    """
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(data)
    except Exception:
        return None
    payload_el = root.find("payload")
    if payload_el is None:
        return None
    payload: dict[str, str] = {}
    for child in payload_el:
        if child.tag and child.text is not None:
            payload[child.tag] = child.text
    return {"payload": payload}


def http_get_json(url: str, *, timeout: float = 15.0, retries: int = 3) -> dict | None:
    """GET → dict. Принимает и JSON, и XML (ФГИС content-negotiates).

    Если первый байт `<` — пробуем XML-парсинг (ResponseWrapper-формат).
    Иначе json.loads.
    """
    for attempt in range(retries):
        try:
            with OPENER.open(url, timeout=timeout) as r:
                data = r.read()
            if not data:
                return None
            if data.lstrip().startswith(b"<"):
                # XML payload (ФГИС sometimes ignores Accept: application/json)
                parsed = _parse_xml_responsewrapper(data)
                if parsed is not None:
                    return parsed
                # XML, но не наш формат — повторим с retry
                time.sleep(0.5 * (attempt + 1))
                continue
            return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # ID не существует
            if e.code in (429, 502, 503, 504):
                time.sleep(1.5 * (2**attempt))
                continue
            return None
        except Exception:
            time.sleep(1.0 * (attempt + 1))
            continue
    return None


def http_post_json(url: str, body: bytes, *, content_type: str,
                   timeout: float = 15.0, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=body,
                method="POST",
                headers={"Content-Type": content_type},
            )
            with OPENER.open(req, timeout=timeout) as r:
                data = r.read()
                ct = r.headers.get("Content-Type", "")
            if "json" not in ct.lower():
                return None
            return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(1.5 * (2**attempt))
                continue
            return None
        except Exception:
            time.sleep(1.0 * (attempt + 1))
            continue
    return None


# ─── Geometry helpers ─────────────────────────────────────────────────────
R_EQ = 20037508.34


def mercator_to_wgs(x: float, y: float) -> tuple[float, float]:
    lon = x / R_EQ * 180.0
    lat = math.degrees(2 * math.atan(math.exp(y / R_EQ * math.pi)) - math.pi / 2)
    return lon, lat


def reproject_polygon_3857_to_4326(coords: list) -> list:
    """Recursively reproject GeoJSON Polygon/MultiPolygon coords."""
    if (
        isinstance(coords, list)
        and coords
        and isinstance(coords[0], (int, float))
    ):
        x, y = coords[0], coords[1]
        return list(mercator_to_wgs(x, y))
    return [reproject_polygon_3857_to_4326(c) for c in coords]


# ─── ФГИС API endpoints ───────────────────────────────────────────────────
def fetch_attrs(object_id: int) -> dict | None:
    """Returns payload dict or None if not found / not a real object."""
    url = f"{ATTR_URL}?layer_code={LAYER_CODE}&object_id={object_id}"
    obj = http_get_json(url)
    if not obj:
        return None
    payload = obj.get("payload") or {}
    if not payload:
        return None
    return payload


# Boundingbox endpoint may return XML or JSON depending on Accept negotiation —
# accept both via regex over response body.
BBOX_RE = re.compile(
    rb"\[?\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*\]?"
)


def fetch_bbox(object_id: int) -> tuple[float, float, float, float] | None:
    """Returns (xmin, ymin, xmax, ymax) in EPSG:3857."""
    url = f"{BBOX_URL}?layer_code={LAYER_CODE}&object_id={object_id}"
    for attempt in range(3):
        try:
            with OPENER.open(url, timeout=15.0) as r:
                data = r.read()
            ct = r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(1.5 * (2**attempt))
                continue
            return None
        except Exception:
            time.sleep(1.0 * (attempt + 1))
            continue
        # ФГИС boundingbox: payload может быть {bbox: [xmin, xmax, ymin, ymax]}
        # либо XML <bbox>[...]</bbox>. Парсим по совпадению чисел.
        if "json" in ct.lower():
            try:
                obj = json.loads(data)
            except Exception:
                return None
            payload = obj.get("payload") or {}
            bbox = payload.get("bbox")
            if bbox and len(bbox) == 4:
                # ФГИС часто отдаёт [xmin, xmax, ymin, ymax] — НЕ стандарт!
                # (Подтверждено по примеру юзера: bbox первого выдела
                # имел [3265497, 3266097, 8467053, 8467352] — пары
                # x-x, y-y, не x-y-x-y.)
                xmin, xmax, ymin, ymax = bbox
                return float(xmin), float(ymin), float(xmax), float(ymax)
        # XML / текстовый fallback
        m = BBOX_RE.search(data)
        if m:
            xmin, xmax, ymin, ymax = (float(g) for g in m.groups())
            return xmin, ymin, xmax, ymax
        return None
    return None


def _wms_query(bbox_str: str, i: int, j: int, w: int = 512) -> dict | None:
    """Низкоуровневый WMS GetFeatureInfo на заданном bbox + click pixel."""
    body = urllib.parse.urlencode({
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "QUERY_LAYERS": QUERY_LAYERS,
        "LAYERS": QUERY_LAYERS,
        "INFO_FORMAT": "application/json",
        "FEATURE_COUNT": "1",
        "I": str(i),
        "J": str(j),
        "CRS": "EPSG:3857",
        "STYLES": "",
        "WIDTH": str(w),
        "HEIGHT": str(w),
        "BBOX": bbox_str,
    }).encode("utf-8")
    return http_post_json(
        WMS_URL, body,
        content_type="application/x-www-form-urlencoded; charset=UTF-8",
    )


def fetch_polygon_verified(
    bbox_3857: tuple[float, float, float, float],
    expected_externalid: str,
) -> dict | None:
    """
    WMS GetFeatureInfo с verify-externalid logic.

    Bbox от boundingbox-endpoint указывает на bbox целевого vydel'а, но
    irregular shape часто не покрывает bbox CENTER — click туда возвращает
    геометрию соседнего vydel. Пробуем 9 click-точек внутри bbox; если
    одна из них вернёт feature с матчащим externalid — берём её.

    2026-05-05: ВАЖНО — verify-drop был bad policy. ФГИС WMS сам по себе
    inconsistent: одни и те же click-coordinates в разное время отдают
    разные externalid'ы (rendering rules + кэширование). Drop'ать всё что
    не match'ит = дыры в карте на 36% точек диагностики.

    Новое поведение: если ни один click не дал extid match, но хотя бы
    одна попытка вернула feature — берём её геометрию (= то что user
    видит на ФГИС-карте), помечаем `wms_extid_mismatch=true`.

    Returns dict:
      - {"geometry": geom_3857, "extid_mismatch": False, "got_extid": ext}
        — match нашли (canonical case)
      - {"geometry": geom_3857, "extid_mismatch": True,  "got_extid": ext}
        — match не нашли но fallback-фича есть
      - None — WMS не вернул ни одной фичи на 9 точках (всё равно дыра
        в данных, но это редко: означает empty bbox или сетевую ошибку)

    ВАЖНО: WIDTH/HEIGHT влияет на server-side scale-dependent rendering
    rules в Geoserver. Cutoff между 128-192; ставим 512 с запасом.
    """
    xmin, ymin, xmax, ymax = bbox_3857
    cx = (xmin + xmax) / 2
    cy = (ymin + ymax) / 2
    half = max((xmax - xmin), (ymax - ymin)) / 2 + 1.0
    bbox_str = f"{cx - half},{cy - half},{cx + half},{cy + half}"

    # 9 кандидатов click-pixel: центр + 8 точек 25/50/75% по двум осям.
    # Для convex polygon чаще всего хватит центра. Для irregular —
    # один из corners/mid-edges попадёт.
    W = 512
    candidates = [
        (W // 2, W // 2),       # center
        (W // 4, W // 2),       # left-mid
        (W * 3 // 4, W // 2),   # right-mid
        (W // 2, W // 4),       # top-mid
        (W // 2, W * 3 // 4),   # bottom-mid
        (W // 4, W // 4),       # tl
        (W * 3 // 4, W // 4),   # tr
        (W // 4, W * 3 // 4),   # bl
        (W * 3 // 4, W * 3 // 4),  # br
    ]

    fallback_geom: dict | None = None
    fallback_extid: str = ""
    for i, j in candidates:
        obj = _wms_query(bbox_str, i, j, W)
        if not obj:
            continue
        feats = obj.get("features") or []
        if not feats:
            continue
        feat = feats[0]
        props = feat.get("properties") or {}
        got_extid = props.get("externalid") or ""
        geom = feat.get("geometry")
        if not geom:
            continue
        if got_extid == expected_externalid:
            return {"geometry": geom, "extid_mismatch": False, "got_extid": got_extid}
        # Сохраняем первую попавшуюся feature как fallback
        if fallback_geom is None:
            fallback_geom = geom
            fallback_extid = got_extid

    if fallback_geom is not None:
        return {"geometry": fallback_geom, "extid_mismatch": True, "got_extid": fallback_extid}
    return None


def fetch_polygon(bbox_3857: tuple[float, float, float, float]) -> dict | None:
    """Backward-compat: WMS GetFeatureInfo at center pixel only.

    Используется в smoke-тестах и debug. Production-путь идёт через
    fetch_polygon_verified() с verify-externalid logic.
    """
    xmin, ymin, xmax, ymax = bbox_3857
    cx = (xmin + xmax) / 2
    cy = (ymin + ymax) / 2
    half = max((xmax - xmin), (ymax - ymin)) / 2 + 1.0
    bbox_str = f"{cx - half},{cy - half},{cx + half},{cy + half}"
    obj = _wms_query(bbox_str, 256, 256, 512)
    if not obj:
        return None
    feats = obj.get("features") or []
    if not feats:
        return None
    return feats[0].get("geometry")


# ─── Pipeline для одного object_id ───────────────────────────────────────
def process_one(object_id: int, region_prefix: str) -> dict | None:
    """
    Returns GeoJSON Feature in EPSG:4326 or None если ID не подходит.
    """
    attrs = fetch_attrs(object_id)
    if not attrs:
        return None
    cadastral = attrs.get("number") or ""
    if not cadastral.startswith(region_prefix):
        return None
    bbox = fetch_bbox(object_id)
    if not bbox:
        return None
    wms_result = fetch_polygon_verified(bbox, cadastral)
    if not wms_result:
        return None
    geom_3857 = wms_result["geometry"]
    coords_4326 = reproject_polygon_3857_to_4326(geom_3857.get("coordinates") or [])
    return {
        "type": "Feature",
        "id": f"TAXATION_PIECE.{object_id}",
        "geometry": {
            "type": geom_3857.get("type", "Polygon"),
            "coordinates": coords_4326,
        },
        "properties": {
            "object_id": object_id,
            "externalid": cadastral,
            "number_lud": attrs.get("number_lud"),
            "forest_quarter_number": attrs.get("forest_quarter_number"),
            "forest_quarter_number_lud": attrs.get("forest_quarter_number_lud"),
            "tree_species": attrs.get("tree_species"),
            "yield_class": attrs.get("yield_class"),
            "age_group": attrs.get("age_group"),
            "square": attrs.get("square"),
            "totalArea": attrs.get("totalArea"),
            "taxation_date": attrs.get("taxation_date"),
            "timber_stock": attrs.get("timber_stock"),
            "type_land": attrs.get("type_land"),
            "category_land": attrs.get("category_land"),
            "forest_land_type": attrs.get("forest_land_type"),
            "event": attrs.get("event"),
            "objectValid": attrs.get("objectValid"),
            "wms_extid_mismatch": wms_result["extid_mismatch"],
            "wms_got_extid": wms_result["got_extid"] if wms_result["extid_mismatch"] else None,
        },
    }


# ─── Progress storage ─────────────────────────────────────────────────────
class Progress:
    def __init__(self, db_path: Path):
        self.conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS done (
                object_id INTEGER PRIMARY KEY,
                status    TEXT NOT NULL,
                feature   TEXT
            )
        """)

    def get_done_set(self) -> set[int]:
        cur = self.conn.execute("SELECT object_id FROM done")
        return {row[0] for row in cur}

    def save(self, object_id: int, status: str, feature: dict | None) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO done (object_id, status, feature) VALUES (?, ?, ?)",
            (object_id, status, json.dumps(feature, ensure_ascii=False) if feature else None),
        )

    def features_iter(self):
        cur = self.conn.execute(
            "SELECT feature FROM done WHERE status='ok' AND feature IS NOT NULL"
        )
        for (txt,) in cur:
            yield json.loads(txt)


# ─── Main ─────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--start", type=int, default=109_022_831)
    p.add_argument("--end", type=int, default=109_118_831)
    # 2026-05-04: было `47:15:` — но это всего ОДИН кадастровый район ЛО.
    # Фактически ЛО имеет несколько cadastral-районов (47:01, 47:02, …, 47:14,
    # 47:15, …) — субъект `47` целиком. Меняем default на `47:` — забираем
    # все кадастровые районы ЛО, не только 15-й. Было 82k выделов / 2400 км²
    # после первого прогона; ожидаем ×10..×20 после расширения фильтра.
    p.add_argument("--region-prefix", default="47:")
    p.add_argument("--workers", type=int, default=20)
    p.add_argument("--out", default="data/rosleshoz/fgislk_attrinfo.geojson")
    p.add_argument("--progress-db", default="data/rosleshoz/fgislk_attrinfo_progress.db")
    p.add_argument("--limit", type=int, default=None,
                   help="DEBUG: process only first N IDs (для smoke-теста)")
    p.add_argument("--export-only", action="store_true",
                   help="Только экспортировать GeoJSON из progress.db, не скрапить")
    p.add_argument("--rerun-wrong-region", action="store_true",
                   help=("Перепрогнать все ID со статусом 'wrong_region' — "
                         "большинство из них транзиентные сбои API (пустой "
                         "payload без поля number → ложно-отбракованные). "
                         "Запускать вместе с расширенным --region-prefix=47:"))
    p.add_argument("--rerun-empty", action="store_true",
                   help="Перепрогнать ID со статусом 'empty' (для проверки)")
    p.add_argument("--ids-file", default=None,
                   help=("Путь к файлу с object_id'ами (один на строку). "
                         "Если указан — заменяет --start/--end диапазон. "
                         "Используется для рестрейпа union(grid-discovered, "
                         "wrong_region) в Phase 2."))
    args = p.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path = Path(args.progress_db)
    progress_path.parent.mkdir(parents=True, exist_ok=True)

    progress = Progress(progress_path)

    if args.export_only:
        export(progress, out_path)
        return

    done = progress.get_done_set()
    # Rerun-режимы: вычеркиваем выбранные статусы из done — будут перепрогнаны.
    if args.rerun_wrong_region or args.rerun_empty:
        statuses_to_rerun: list[str] = []
        if args.rerun_wrong_region:
            statuses_to_rerun.append("wrong_region")
        if args.rerun_empty:
            statuses_to_rerun.append("empty")
        with sqlite3.connect(str(progress_path)) as c:
            placeholders = ",".join("?" for _ in statuses_to_rerun)
            rerun_ids = {
                r[0] for r in c.execute(
                    f"SELECT object_id FROM done WHERE status IN ({placeholders})",
                    statuses_to_rerun,
                )
            }
            # Удаляем — иначе они в `done` set и будут пропущены ниже.
            c.execute(
                f"DELETE FROM done WHERE status IN ({placeholders})",
                statuses_to_rerun,
            )
        done = done - rerun_ids
        print(f"Rerun mode: reprocessing {len(rerun_ids):,} {statuses_to_rerun} IDs")

    if args.ids_file:
        # Phase-2 mode: ID-список из файла (grid-discovered ∪ wrong_region)
        ids_from_file: list[int] = []
        with open(args.ids_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                try:
                    ids_from_file.append(int(line))
                except ValueError:
                    continue
        unique_ids = set(ids_from_file)
        todo = sorted(unique_ids - done)
        print(f"IDs from file: {len(unique_ids):,} unique (out of {len(ids_from_file):,} lines)")
    else:
        todo = [i for i in range(args.start, args.end + 1) if i not in done]
        print(f"Range: {args.start:,} ... {args.end:,}  ({args.end - args.start + 1:,} IDs)")
    if args.limit:
        todo = todo[: args.limit]
    print(f"Already processed: {len(done):,}")
    print(f"To do this run:    {len(todo):,}")
    print(f"Workers:           {args.workers}")
    print(f"Region prefix:     {args.region_prefix!r}")
    print()

    t0 = time.time()
    n_ok = n_skip = n_fail = 0

    def worker(oid: int) -> tuple[int, str, dict | None]:
        try:
            feat = process_one(oid, args.region_prefix)
            if feat is None:
                # либо ID не существует, либо не наш регион
                attrs = fetch_attrs(oid)
                status = "empty" if not attrs else "wrong_region"
                return oid, status, None
            return oid, "ok", feat
        except Exception as e:
            print(f"  [error] id={oid}: {e}", file=sys.stderr)
            return oid, "error", None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(worker, oid) for oid in todo]
        for i, f in enumerate(as_completed(futs), 1):
            oid, status, feat = f.result()
            progress.save(oid, status, feat)
            if status == "ok":
                n_ok += 1
            elif status in ("empty", "wrong_region"):
                n_skip += 1
            else:
                n_fail += 1
            if i % 500 == 0:
                dt = time.time() - t0
                rate = i / dt
                eta = (len(todo) - i) / rate if rate > 0 else 0
                print(
                    f"  {i:>6}/{len(todo)}  ok={n_ok:>5} skip={n_skip:>5} fail={n_fail:>3}"
                    f"  {rate:.1f}/s  eta {eta / 60:.1f}min"
                )

    dt = time.time() - t0
    print()
    print(f"Done in {dt / 60:.1f} min.  ok={n_ok}  skip={n_skip}  fail={n_fail}")
    print(f"Total rate: {len(todo) / dt:.1f}/s")
    print()
    export(progress, out_path)


def export(progress: Progress, out_path: Path) -> None:
    """
    Дедуплицирует по cadastral (поле `externalid`) — для одного выдела
    в ФГИС может существовать несколько object_id (старая и новая
    ревизии лесоустройства, в attributesinfo отдают тот же `number` но
    разный `taxation_date`). Оставляем самую свежую.

    Это норма — юзер на ФГИС-карте видит «Найдено объектов: 2» когда
    кликает на выдел который перенёс ревизию в 2023 году поверх 2018.
    """
    print(f"Exporting GeoJSON -> {out_path}")
    print("  Reading + dedup by cadastral (latest taxation_date wins)...")

    by_cad: dict[str, dict] = {}
    n_in = 0
    for feat in progress.features_iter():
        n_in += 1
        cad = feat.get("properties", {}).get("externalid")
        if not cad:
            # Без cadastral дедуп невозможен — оставляем по object_id
            cad = f"_no_cadastral_{feat['id']}"
        existing = by_cad.get(cad)
        if existing is None:
            by_cad[cad] = feat
            continue
        # Сравниваем taxation_date (год работ). Не-int → 0 = older.
        def date_key(f):
            d = f.get("properties", {}).get("taxation_date")
            try:
                return int(d) if d else 0
            except (ValueError, TypeError):
                return 0
        if date_key(feat) > date_key(existing):
            by_cad[cad] = feat

    print(f"  Input features: {n_in:,}, unique cadastrals: {len(by_cad):,}")
    print(f"  Dedup-dropped:  {n_in - len(by_cad):,} (older revisions)")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        first = True
        for feat in by_cad.values():
            if not first:
                f.write(",\n")
            json.dump(feat, f, ensure_ascii=False)
            first = False
        f.write("\n]}\n")
    print(f"Wrote {len(by_cad):,} features.")


if __name__ == "__main__":
    main()
