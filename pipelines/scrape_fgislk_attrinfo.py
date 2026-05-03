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
        ("Accept", "*/*"),
        ("Accept-Language", "ru,en;q=0.9"),
        ("Referer", "https://pub.fgislk.gov.ru/map/"),
    ]
    try:
        opener.open("https://pub.fgislk.gov.ru/map/", timeout=10).read()
    except Exception:
        pass
    return opener


OPENER = make_opener()


def http_get_json(url: str, *, timeout: float = 15.0, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            with OPENER.open(url, timeout=timeout) as r:
                return json.loads(r.read())
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


def fetch_polygon(bbox_3857: tuple[float, float, float, float]) -> dict | None:
    """
    WMS GetFeatureInfo at center pixel of given bbox (EPSG:3857).
    Returns Polygon geometry as GeoJSON dict (still in EPSG:3857).
    """
    xmin, ymin, xmax, ymax = bbox_3857
    # Сужаем bbox до нашего objectа — тогда click в центр гарантированно
    # попадёт внутрь полигона. Также увеличиваем bbox чуть-чуть в случае
    # если bbox был tight и центр пиксель попадает на edge.
    cx = (xmin + xmax) / 2
    cy = (ymin + ymax) / 2
    half = max((xmax - xmin), (ymax - ymin)) / 2 + 1.0
    bbox = f"{cx - half},{cy - half},{cx + half},{cy + half}"

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
        "I": "50",
        "J": "50",
        "CRS": "EPSG:3857",
        "STYLES": "",
        "WIDTH": "101",
        "HEIGHT": "101",
        "BBOX": bbox,
    }).encode("utf-8")
    obj = http_post_json(
        WMS_URL, body,
        content_type="application/x-www-form-urlencoded; charset=UTF-8",
    )
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
    geom_3857 = fetch_polygon(bbox)
    if not geom_3857:
        return None
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
    p.add_argument("--region-prefix", default="47:15:")
    p.add_argument("--workers", type=int, default=20)
    p.add_argument("--out", default="data/rosleshoz/fgislk_attrinfo.geojson")
    p.add_argument("--progress-db", default="data/rosleshoz/fgislk_attrinfo_progress.db")
    p.add_argument("--limit", type=int, default=None,
                   help="DEBUG: process only first N IDs (для smoke-теста)")
    p.add_argument("--export-only", action="store_true",
                   help="Только экспортировать GeoJSON из progress.db, не скрапить")
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
    todo = [i for i in range(args.start, args.end + 1) if i not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"Range: {args.start:,} ... {args.end:,}  ({args.end - args.start + 1:,} IDs)")
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
