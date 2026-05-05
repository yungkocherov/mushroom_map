"""
fgislk_grid_sweep: WMS GetFeatureInfo по равномерной сетке точек над bbox ЛО,
для authoritative discovery всех object_id выделов FGIS.

ЗАЧЕМ:
  Probe-based ID-enumeration принципиально insufficient — FGIS ID-space
  sparse и multi-block (один cadastral district может иметь N disconnected
  ID-блоков). См. memory project_fgislk_full_coverage_root_cause.md.

  Grid-sweep — geo-driven discovery: для каждой точки сетки спрашиваем
  WMS «какой выдел тут рендерится?» и собираем object_id.

ВЫХОД:
  data/rosleshoz/fgislk_grid_discovery.db (SQLite, resume-friendly):
    CREATE TABLE grid (
        lat REAL, lon REAL,
        status TEXT,         -- 'ok' | 'no_feature' | 'error'
        object_id INTEGER,   -- из feature.id ("TAXATION_PIECE.<n>")
        externalid TEXT
    )

ПОТОК:
  1. Generate grid 400m × 400m over LO bbox (~660k points)
  2. ThreadPoolExecutor: 30 workers
  3. Each worker: WMS POST GetFeatureInfo(bbox=200m around point)
  4. Save (lat, lon, status, object_id, externalid)

ИСПОЛЬЗОВАНИЕ:
  .venv/Scripts/python.exe pipelines/fgislk_grid_sweep.py
  .venv/Scripts/python.exe pipelines/fgislk_grid_sweep.py --step 400 --workers 30

  # Экспорт unique object_id'ов:
  .venv/Scripts/python.exe pipelines/fgislk_grid_sweep.py --export-ids \\
      --out data/rosleshoz/grid_discovered_ids.txt
"""
from __future__ import annotations

import argparse
import math
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Reuse HTTP plumbing + WMS query из основного скрапера
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipelines.scrape_fgislk_attrinfo import _wms_query  # noqa: E402

# LO bbox: south, west, north, east  (LO_BBOX_DEFAULT из scripts/_bbox.py)
BBOX = (58.5, 27.8, 61.8, 33.0)

R_EQ = 6378137.0


def lonlat_to_3857(lon: float, lat: float) -> tuple[float, float]:
    x = R_EQ * math.radians(lon)
    y = R_EQ * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def gen_grid(bbox: tuple[float, float, float, float], step_m: int) -> list[tuple[float, float]]:
    """Generate (lat, lon) grid with step ≈ step_m metres at local latitude.

    На широте 60° 1° lat ≈ 111 км, 1° lon ≈ 55.5 км. Используем lat 60° для
    расчёта lon-step (упрощение — bbox узкий, погрешность <5%).
    """
    s, w, n, e = bbox
    mid_lat = (s + n) / 2
    dlat = step_m / 111_000.0
    dlon = step_m / (111_000.0 * math.cos(math.radians(mid_lat)))
    lat = s
    pts: list[tuple[float, float]] = []
    while lat <= n:
        lon = w
        while lon <= e:
            pts.append((round(lat, 6), round(lon, 6)))
            lon += dlon
        lat += dlat
    return pts


def init_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS grid (
            lat REAL,
            lon REAL,
            status TEXT NOT NULL,
            object_id INTEGER,
            externalid TEXT,
            PRIMARY KEY (lat, lon)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS grid_oid_idx ON grid(object_id)")
    return conn


def query_point(lat: float, lon: float) -> tuple[str, int | None, str | None]:
    """Returns (status, object_id, externalid). Bbox 200m around point."""
    cx, cy = lonlat_to_3857(lon, lat)
    half = 100  # метров — 200m bbox
    bbox = f"{cx - half},{cy - half},{cx + half},{cy + half}"
    obj = _wms_query(bbox, 256, 256, w=512)
    if obj is None:
        return "error", None, None
    feats = obj.get("features") or []
    if not feats:
        return "no_feature", None, None
    f = feats[0]
    fid = f.get("id", "")
    try:
        oid = int(fid.split(".")[-1])
    except (ValueError, IndexError):
        return "no_feature", None, None
    extid = (f.get("properties") or {}).get("externalid") or ""
    return "ok", oid, extid


def worker(point: tuple[float, float]) -> tuple[float, float, str, int | None, str | None]:
    lat, lon = point
    try:
        st, oid, ext = query_point(lat, lon)
        return lat, lon, st, oid, ext
    except Exception:
        return lat, lon, "error", None, None


def run(step_m: int, workers: int, db_path: Path) -> None:
    conn = init_db(db_path)
    all_pts = gen_grid(BBOX, step_m)
    print(f"Grid: {len(all_pts):,} points, step={step_m}m, bbox={BBOX}")

    cur = conn.execute("SELECT lat, lon FROM grid")
    done = {(r[0], r[1]) for r in cur}
    print(f"Already done: {len(done):,}")
    todo = [p for p in all_pts if p not in done]
    print(f"To do this run: {len(todo):,}")
    print(f"Workers: {workers}")
    print()

    if not todo:
        print("Nothing to do.")
        return

    t0 = time.time()
    n_ok = n_empty = n_err = 0
    n_unique_oid = set()

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(worker, p) for p in todo]
        for i, f in enumerate(as_completed(futs), 1):
            lat, lon, st, oid, ext = f.result()
            conn.execute(
                "INSERT OR REPLACE INTO grid (lat, lon, status, object_id, externalid) "
                "VALUES (?, ?, ?, ?, ?)",
                (lat, lon, st, oid, ext),
            )
            if st == "ok":
                n_ok += 1
                if oid is not None:
                    n_unique_oid.add(oid)
            elif st == "no_feature":
                n_empty += 1
            else:
                n_err += 1
            if i % 1000 == 0:
                dt = time.time() - t0
                rate = i / dt
                eta = (len(todo) - i) / rate if rate > 0 else 0
                # global unique count from db
                cur = conn.execute("SELECT COUNT(DISTINCT object_id) FROM grid WHERE object_id IS NOT NULL")
                total_oids = cur.fetchone()[0]
                print(
                    f"  {i:>7}/{len(todo)}  ok={n_ok:>6} empty={n_empty:>6} err={n_err:>4}"
                    f"  rate={rate:.1f}/s  eta={eta / 60:.1f}min  unique_oids={total_oids:,}"
                )

    dt = time.time() - t0
    print()
    print(f"Done in {dt / 60:.1f} min.  ok={n_ok}  empty={n_empty}  err={n_err}")
    cur = conn.execute("SELECT COUNT(DISTINCT object_id) FROM grid WHERE object_id IS NOT NULL")
    print(f"Total unique object_ids discovered: {cur.fetchone()[0]:,}")


def export_ids(db_path: Path, out_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    cur = conn.execute("SELECT DISTINCT object_id FROM grid WHERE object_id IS NOT NULL ORDER BY object_id")
    n = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for (oid,) in cur:
            f.write(f"{oid}\n")
            n += 1
    print(f"Wrote {n:,} unique object_ids -> {out_path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--step", type=int, default=400, help="grid step in metres (default 400)")
    p.add_argument("--workers", type=int, default=30)
    p.add_argument("--db", default="data/rosleshoz/fgislk_grid_discovery.db")
    p.add_argument("--export-ids", action="store_true",
                   help="Только экспорт unique object_ids в файл, без сканирования")
    p.add_argument("--out", default="data/rosleshoz/grid_discovered_ids.txt")
    args = p.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.export_ids:
        export_ids(db_path, Path(args.out))
        return

    run(args.step, args.workers, db_path)


if __name__ == "__main__":
    main()
