"""
discover_oids_from_mvt: канонический discovery механизм object_id'ов выделов
ФГИС через MVT-тайлы.

ЗАЧЕМ:
  Probe-based ID enumeration + WMS-grid-sweep дают sparse coverage (~15-20%
  выделов в hot oid range). FGIS map сам работает через MVT тайлы как
  индекс — браузер качает MVT, читает feature.id из layer
  TAXATION_PIECE_PVS, потом дёргает attributesinfo(id) для атрибутов.
  Мы используем ту же стратегию: качаем MVT для bbox/zoom, извлекаем все
  object_id'ы, потом отдаём их в `scrape_fgislk_attrinfo.py --ids-file`
  для accurate per-feature data.

  В отличие от старого `download_fgislk_tiles.py` + `fgislk_tiles_to_geojson.py`
  (deleted в 3262abd), этот скрипт **не сохраняет MVT геометрию** — она
  упрощённая (server rendering tolerance). Только oid + externalid + tree_species
  как hint.

ПОТОК:
  1. bbox + zoom range → grid тайлов (TMS, custom GWC grid origin -20037508)
  2. ThreadPoolExecutor: качает все тайлы (load-balanced между pub4/pub5)
  3. Decode MVT, извлекает features из layer TAXATION_PIECE_PVS:
       id (=object_id), externalid, tree_species, age_group, label_name
  4. Сохраняет в SQLite с UNIQUE(object_id) — дедуп между зумами/тайлами
  5. Опционально: экспорт unique object_ids в текстовый файл для скрейпера

ВЫХОД:
  data/rosleshoz/mvt_oid_discovery.db (SQLite):
    CREATE TABLE oids (
        object_id INTEGER PRIMARY KEY,
        externalid TEXT,
        tree_species TEXT,
        label_name TEXT,
        first_seen_zoom INTEGER,
        first_seen_tile TEXT
    );

ИСПОЛЬЗОВАНИЕ:
  # Тест на маленьком bbox (Гатчинский админ-район)
  .venv/Scripts/python.exe pipelines/discover_oids_from_mvt.py \\
      --bbox 29.70,59.40,30.50,59.70 \\
      --zooms 10,11,12 \\
      --workers 30

  # Полная Ленобласть
  .venv/Scripts/python.exe pipelines/discover_oids_from_mvt.py \\
      --bbox 27.8,58.5,33.0,61.8 \\
      --zooms 10,11,12 --workers 30

  # Экспорт unique oids в txt для скрейпера
  .venv/Scripts/python.exe pipelines/discover_oids_from_mvt.py \\
      --export-ids --out data/rosleshoz/mvt_discovered_ids.txt
"""
from __future__ import annotations

import argparse
import gzip
import math
import sqlite3
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar
from itertools import cycle
from pathlib import Path

import mapbox_vector_tile

# GWC custom grid (TileMap descriptor; см. memory/reference_fgislk_api.md).
ORIGIN_X = -20037508.34
ORIGIN_Y = -20037508.34
TILE = 256
UPP: dict[int, float] = {7: 140.0, 8: 56.0, 9: 28.0, 10: 14.0, 11: 7.0, 12: 2.8}
# Total grid extent в метрах (для подсчёта tiles_per_side и y-flip)
TOTAL_EXTENT = 2 * 20037508.34

# Server pool — балансируем нагрузку между pub4 и pub5 (вне VPN, иначе 403).
TILE_SERVERS = ["pub4.fgislk.gov.ru", "pub5.fgislk.gov.ru"]
LAYER_PATH = "plk/gwc-01/geowebcache/service/tms/1.0.0/FOREST_LAYERS:FOREST@EPSG:3857@pbf"
TARGET_LAYER = "TAXATION_PIECE_PVS"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)


# ─── HTTP plumbing (re-use стиля из scrape_fgislk_attrinfo.py) ────────────────
def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


SSL_CTX = make_ssl_context()


def make_opener() -> urllib.request.OpenerDirector:
    jar = CookieJar()
    op = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    op.addheaders = [
        ("User-Agent", UA),
        ("Accept", "application/x-protobuf, */*;q=0.5"),
        ("Referer", "https://pub.fgislk.gov.ru/map/"),
    ]
    try:
        op.open("https://pub.fgislk.gov.ru/map/", timeout=10).read()
    except Exception:
        pass
    return op


OPENER = make_opener()


# ─── Tile math (custom GWC grid) ──────────────────────────────────────────────
def lonlat_to_3857(lon: float, lat: float) -> tuple[float, float]:
    R = 6378137.0
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def tile_xy_for_point(lon: float, lat: float, z: int) -> tuple[int, int]:
    """Returns (tx, ty) в TMS-нумерации (origin lower-left) для нашего custom grid."""
    mx, my = lonlat_to_3857(lon, lat)
    upp = UPP[z]
    tx = int((mx - ORIGIN_X) / (upp * TILE))
    ty = int((my - ORIGIN_Y) / (upp * TILE))
    return tx, ty


def tiles_for_bbox(bbox: tuple[float, float, float, float], z: int) -> list[tuple[int, int]]:
    """bbox = (min_lon, min_lat, max_lon, max_lat). Returns list of (tx, ty) at zoom z."""
    min_lon, min_lat, max_lon, max_lat = bbox
    tx_min, ty_min = tile_xy_for_point(min_lon, min_lat, z)
    tx_max, ty_max = tile_xy_for_point(max_lon, max_lat, z)
    tx_lo, tx_hi = min(tx_min, tx_max), max(tx_min, tx_max)
    ty_lo, ty_hi = min(ty_min, ty_max), max(ty_min, ty_max)
    return [(tx, ty) for tx in range(tx_lo, tx_hi + 1) for ty in range(ty_lo, ty_hi + 1)]


# ─── DB ───────────────────────────────────────────────────────────────────────
def init_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS oids (
            object_id        INTEGER PRIMARY KEY,
            externalid       TEXT,
            tree_species     TEXT,
            label_name       TEXT,
            first_seen_zoom  INTEGER,
            first_seen_tile  TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tile_progress (
            zoom    INTEGER NOT NULL,
            tx      INTEGER NOT NULL,
            ty      INTEGER NOT NULL,
            status  TEXT NOT NULL,    -- 'ok' | 'empty' | 'error'
            n_oids  INTEGER,
            PRIMARY KEY (zoom, tx, ty)
        )
    """)
    return conn


def get_done_tiles(conn: sqlite3.Connection, z: int) -> set[tuple[int, int]]:
    return {(r[0], r[1]) for r in conn.execute(
        "SELECT tx, ty FROM tile_progress WHERE zoom=?", (z,)
    )}


# ─── Fetch + decode ───────────────────────────────────────────────────────────
_server_iter = cycle(TILE_SERVERS)


def fetch_tile(z: int, tx: int, ty: int, max_retries: int = 2) -> bytes | None:
    """Качает тайл в TMS-y координатах (URL-формат: {z}/{x}/{y}.pbf)."""
    for attempt in range(max_retries + 1):
        server = next(_server_iter)
        url = f"https://{server}/{LAYER_PATH}/{z}/{tx}/{ty}.pbf"
        try:
            r = OPENER.open(url, timeout=30)
            data = r.read()
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            return data
        except urllib.error.HTTPError as e:
            # 404 = тайл за пределами grid'а; 403 = WAF; ретрай не поможет
            if e.code in (403, 404):
                return None
            if attempt < max_retries:
                time.sleep(0.5 * (attempt + 1))
        except Exception:
            if attempt < max_retries:
                time.sleep(0.5 * (attempt + 1))
    return None


def parse_oids_from_tile(data: bytes) -> list[tuple[int, str, str, str]]:
    """Returns list of (object_id, externalid, tree_species, label_name)."""
    if not data:
        return []
    try:
        tile = mapbox_vector_tile.decode(data)
    except Exception:
        return []
    layer = tile.get(TARGET_LAYER)
    if not layer:
        return []
    out: list[tuple[int, str, str, str]] = []
    for feat in layer.get("features") or []:
        oid = feat.get("id")
        if oid is None:
            continue
        try:
            oid = int(oid)
        except (TypeError, ValueError):
            continue
        props = feat.get("properties") or {}
        ext = props.get("externalid") or ""
        sp = props.get("tree_species") or ""
        lb = props.get("label_name") or ""
        out.append((oid, ext, sp, lb))
    return out


# ─── Worker ───────────────────────────────────────────────────────────────────
def worker(z: int, tx: int, ty: int) -> tuple[int, int, int, str, list]:
    """Returns (z, tx, ty, status, oids_list)."""
    data = fetch_tile(z, tx, ty)
    if data is None:
        return z, tx, ty, "error", []
    if len(data) < 50:
        return z, tx, ty, "empty", []
    oids = parse_oids_from_tile(data)
    if not oids:
        return z, tx, ty, "empty", []
    return z, tx, ty, "ok", oids


# ─── Main ─────────────────────────────────────────────────────────────────────
def parse_bbox(s: str) -> tuple[float, float, float, float]:
    parts = [float(p) for p in s.split(",")]
    if len(parts) != 4:
        raise SystemExit("bbox: ожидаю min_lon,min_lat,max_lon,max_lat")
    return parts[0], parts[1], parts[2], parts[3]


def run(bbox: tuple[float, float, float, float], zooms: list[int],
        workers: int, db_path: Path) -> None:
    conn = init_db(db_path)

    all_tiles: list[tuple[int, int, int]] = []
    for z in zooms:
        if z not in UPP:
            print(f"WARN: zoom {z} вне custom grid {sorted(UPP)}; skip")
            continue
        tiles = tiles_for_bbox(bbox, z)
        done = get_done_tiles(conn, z)
        new = [(z, tx, ty) for tx, ty in tiles if (tx, ty) not in done]
        print(f"  z={z}: {len(tiles):,} total, {len(done):,} done, {len(new):,} todo")
        all_tiles.extend(new)

    if not all_tiles:
        print("Nothing to do.")
        return

    print(f"Workers: {workers}, total tiles to fetch: {len(all_tiles):,}")
    print(f"BBOX: {bbox}, zooms: {zooms}")
    print()

    t0 = time.time()
    n_ok = n_empty = n_err = 0
    n_oids_new = 0

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(worker, z, tx, ty) for (z, tx, ty) in all_tiles]
        for i, f in enumerate(as_completed(futs), 1):
            z, tx, ty, status, oids = f.result()
            n_features = len(oids)
            conn.execute(
                "INSERT OR REPLACE INTO tile_progress (zoom, tx, ty, status, n_oids) "
                "VALUES (?, ?, ?, ?, ?)",
                (z, tx, ty, status, n_features),
            )
            if status == "ok":
                n_ok += 1
                tile_label = f"{z}/{tx}/{ty}"
                # Bulk INSERT OR IGNORE (только новые oid'ы дёргают write)
                with conn:
                    cur = conn.execute("BEGIN")
                    for oid, ext, sp, lb in oids:
                        cur = conn.execute(
                            "INSERT OR IGNORE INTO oids (object_id, externalid, "
                            "tree_species, label_name, first_seen_zoom, first_seen_tile) "
                            "VALUES (?, ?, ?, ?, ?, ?)",
                            (oid, ext, sp, lb, z, tile_label),
                        )
                        if cur.rowcount > 0:
                            n_oids_new += 1
            elif status == "empty":
                n_empty += 1
            else:
                n_err += 1
            if i % 200 == 0:
                dt = time.time() - t0
                rate = i / max(dt, 0.001)
                eta = (len(all_tiles) - i) / max(rate, 0.001) / 60
                cur = conn.execute("SELECT COUNT(*) FROM oids")
                total_oids = cur.fetchone()[0]
                print(
                    f"  {i:>6}/{len(all_tiles)}  ok={n_ok:>5} empty={n_empty:>5} err={n_err:>4}"
                    f"  rate={rate:.1f}/s  eta={eta:.1f}min  unique_oids={total_oids:,}"
                )

    dt = time.time() - t0
    cur = conn.execute("SELECT COUNT(*) FROM oids")
    total_oids = cur.fetchone()[0]
    print()
    print(f"Done in {dt / 60:.1f} min")
    print(f"  tiles ok={n_ok:,}  empty={n_empty:,}  err={n_err:,}")
    print(f"  unique oids in DB: {total_oids:,}  (new this run: {n_oids_new:,})")


def export_ids(db_path: Path, out_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    n = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for (oid,) in conn.execute(
            "SELECT object_id FROM oids ORDER BY object_id"
        ):
            f.write(f"{oid}\n")
            n += 1
    print(f"Wrote {n:,} object_ids -> {out_path}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--bbox", default="27.8,58.5,33.0,61.8",
                   help="min_lon,min_lat,max_lon,max_lat (default: full LO)")
    p.add_argument("--zooms", default="10,11,12",
                   help="comma-separated zoom levels (default: 10,11,12)")
    p.add_argument("--workers", type=int, default=30)
    p.add_argument("--db", default="data/rosleshoz/mvt_oid_discovery.db")
    p.add_argument("--export-ids", action="store_true",
                   help="Только экспорт unique object_id'ов из --db в --out, без скрапинга")
    p.add_argument("--out", default="data/rosleshoz/mvt_discovered_ids.txt")
    args = p.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.export_ids:
        export_ids(db_path, Path(args.out))
        return

    bbox = parse_bbox(args.bbox)
    zooms = [int(z) for z in args.zooms.split(",") if z.strip()]
    run(bbox, zooms, args.workers, db_path)


if __name__ == "__main__":
    main()
