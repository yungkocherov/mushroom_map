"""
Качает Copernicus GLO-30 DEM (1° x 1° COG-тайлы) для bbox ЛО+Карелия.

Источник: AWS Open Data (публичный, без регистрации).
URL-шаблон:
    https://copernicus-dem-30m.s3.amazonaws.com/
        Copernicus_DSM_COG_10_N{NN}_00_E{EEE}_00_DEM/
        Copernicus_DSM_COG_10_N{NN}_00_E{EEE}_00_DEM.tif

Тайл "N60_E030" покрывает 60..61 N, 30..31 E (имя по SW-углу).

BBOX: 58..67 N, 28..37 E = 9 x 9 = 81 тайл, ~30 МБ каждый ~= 2.4 ГБ.
Идемпотентен: пропускает существующие файлы. Скачивает последовательно
(S3 и так отдаёт быстро, параллелить смысла нет при таком размере).
"""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# bbox ЛО + Карелия (integer tile edges).
LAT_MIN, LAT_MAX = 58, 67  # covers N58..N66 tile rows
LON_MIN, LON_MAX = 28, 37  # covers E028..E036 tile cols

OUT_DIR = Path("data/copernicus/dem_glo30")
BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


def tile_url(lat: int, lon: int) -> tuple[str, str]:
    name = f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"
    return f"{BASE}/{name}/{name}.tif", f"{name}.tif"


def download(url: str, dst: Path) -> tuple[bool, str]:
    """Скачивает файл, возвращает (ok, сообщение). skip=ok."""
    if dst.exists() and dst.stat().st_size > 0:
        return True, f"skip ({dst.stat().st_size // 1024} KB)"
    tmp = dst.with_suffix(dst.suffix + ".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mushroom-map/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        tmp.rename(dst)
        return True, f"ok ({dst.stat().st_size // 1024} KB)"
    except urllib.error.HTTPError as e:
        tmp.unlink(missing_ok=True)
        return False, f"HTTP {e.code}"
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return False, f"err: {e}"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = [(lat, lon)
             for lat in range(LAT_MIN, LAT_MAX)
             for lon in range(LON_MIN, LON_MAX)]
    total = len(tiles)
    ok = skipped = missing = failed = 0
    start = time.time()
    for i, (lat, lon) in enumerate(tiles, 1):
        url, name = tile_url(lat, lon)
        dst = OUT_DIR / name
        status, msg = download(url, dst)
        if status:
            if msg.startswith("skip"):
                skipped += 1
            else:
                ok += 1
        else:
            if "404" in msg:
                # Copernicus покрытие глобальное, но над водой тайлов нет.
                missing += 1
            else:
                failed += 1
        elapsed = time.time() - start
        print(f"[{i:3d}/{total}] N{lat:02d}_E{lon:03d}  {msg:20s}  "
              f"({elapsed:.0f}s, ok={ok} skip={skipped} miss={missing} fail={failed})",
              flush=True)
    print(f"\nDone: ok={ok} skipped={skipped} missing={missing} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
