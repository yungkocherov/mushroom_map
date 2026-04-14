"""
orchestrate_rosleshoz: автоматизирует полный цикл получения и интеграции
данных ФГИС ЛК. Используется для длительных прогонов "оставь и забудь".

Стадии:
    1) Ожидает завершения уже запущенного Karelian download (polls файл
       лога на наличие строки "FINISHED").
    2) Конвертирует все скачанные MVT-тайлы в GeoJSON.
    3) Удаляет старые rosleshoz-строки из forest_polygon и загружает
       новый GeoJSON.
    4) Пересобирает PMTiles.
    5) Коммитит промежуточное состояние в git.
    6) Стартует download всей Ленобласти (resume-aware — пропускает
       уже скачанные тайлы из п.1).
    7) Повторяет convert + ingest + rebuild + push.
    8) Пишет подробный лог в ``data/tmp/orchestrator.log``.

Запуск:
    python pipelines/orchestrate_rosleshoz.py

Можно параметризовать:
    --karelian-log <path>   — файл лога текущего Karelian download'а
    --skip-wait             — сразу перейти ко второму этапу
    --skip-stage1           — пропустить Karelian convert+ingest, сразу
                              запустить полный download
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
PY = str(REPO_ROOT / ".venv" / "Scripts" / "python.exe")

LOG_PATH = REPO_ROOT / "data" / "tmp" / "orchestrator.log"
TILES_DIR = REPO_ROOT / "data" / "rosleshoz" / "fgislk_tiles"
GEOJSON_KAREL = REPO_ROOT / "data" / "rosleshoz" / "fgislk_vydels_karelian.geojson"
GEOJSON_FULL = REPO_ROOT / "data" / "rosleshoz" / "fgislk_vydels_full.geojson"
PMTILES_OUT = REPO_ROOT / "data" / "tiles" / "forest.pmtiles"

KAREL_BBOX = "28.5,59.8,31.0,61.3"
FULL_BBOX = "27.8,58.5,33.0,61.8"

ENV_DEFAULTS = {
    "DATABASE_URL": "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
    "PYTHONIOENCODING": "utf-8",
    "PYTHONUNBUFFERED": "1",
}


def log(msg: str) -> None:
    stamp = time.strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True) -> int:
    log(f"$ {' '.join(str(c) for c in cmd)}")
    env = dict(os.environ)
    for k, v in ENV_DEFAULTS.items():
        env.setdefault(k, v)
    proc = subprocess.run(
        cmd,
        cwd=cwd or REPO_ROOT,
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    if check and proc.returncode != 0:
        raise SystemExit(f"command failed (rc={proc.returncode}): {cmd}")
    return proc.returncode


def wait_for_karelian_log(log_path: Path, poll_s: int = 60) -> None:
    """Опрашивает файл-лог Karelian download'а, пока не увидит 'FINISHED'."""
    log(f"waiting for Karelian download log: {log_path}")
    while True:
        if log_path.exists():
            try:
                # Читаем последние 2000 байт (хватает чтоб поймать FINISHED)
                with open(log_path, "rb") as f:
                    f.seek(0, 2)
                    size = f.tell()
                    f.seek(max(0, size - 2000))
                    tail = f.read().decode("utf-8", errors="replace")
                if "FINISHED" in tail:
                    log("Karelian download finished (FINISHED marker detected)")
                    return
            except Exception as e:
                log(f"   (log read error: {e})")
        time.sleep(poll_s)


def db_reset_rosleshoz() -> None:
    """Удаляет все rosleshoz-строки из forest_polygon (для re-ingest)."""
    cmd = [
        "docker", "exec", "mushroom_db",
        "psql", "-U", "mushroom", "mushroom_map",
        "-c", "DELETE FROM forest_polygon WHERE source = 'rosleshoz';",
    ]
    run(cmd)


def git_commit_and_push(message: str) -> None:
    # добавим обновлённый PMTiles если файл отслеживается
    run(["git", "add", "-A", ":/data/tiles"], check=False)
    rc = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT).returncode
    if rc == 0:
        log("nothing to commit (no changes staged)")
    else:
        run(["git", "commit", "-m", message], check=False)
    run(["git", "push"], check=False)


def convert_to_geojson(out: Path) -> None:
    run([PY, "pipelines/fgislk_tiles_to_geojson.py",
         "--in", str(TILES_DIR),
         "--out", str(out)])


def ingest_geojson(geojson: Path, version: str) -> None:
    run([PY, "pipelines/ingest_forest.py",
         "--source", "rosleshoz",
         "--region", "lenoblast",
         "--rosleshoz-file", str(geojson),
         "--rosleshoz-version", version])


def rebuild_pmtiles() -> None:
    run([PY, "-u", "pipelines/build_tiles.py",
         "--region", "lenoblast",
         "--out", str(PMTILES_OUT)])


def download_full_lenoblast() -> None:
    """Качает все 830k тайлов для всей Ленобласти (resume пропускает
    уже имеющиеся)."""
    run([PY, "-u", "pipelines/download_fgislk_tiles.py",
         "--bbox", FULL_BBOX,
         "--concurrency", "20",
         "--out", str(TILES_DIR)])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--karelian-log", default=None,
                    help="Путь к логу текущего Karelian download'а")
    ap.add_argument("--skip-wait", action="store_true",
                    help="Не ждать Karelian download (сразу к convert)")
    ap.add_argument("--skip-stage1", action="store_true",
                    help="Пропустить Karelian convert+ingest, сразу запустить полный download")
    args = ap.parse_args()

    log("=" * 70)
    log("orchestrator START")
    log("=" * 70)

    # ── Stage 1: Karelian ingest ────────────────────────────────────────
    if not args.skip_stage1:
        if not args.skip_wait:
            if not args.karelian_log:
                log("WARN: --karelian-log не задан, пропускаю ожидание")
            else:
                wait_for_karelian_log(Path(args.karelian_log))

        log("── stage 1: convert Karelian MVT → GeoJSON")
        convert_to_geojson(GEOJSON_KAREL)

        log("── stage 1: delete old rosleshoz rows")
        db_reset_rosleshoz()

        log("── stage 1: ingest Karelian GeoJSON")
        ingest_geojson(GEOJSON_KAREL, "fgislk-karelian-2026")

        log("── stage 1: rebuild PMTiles")
        rebuild_pmtiles()

        log("── stage 1: git commit + push")
        git_commit_and_push(
            "Rosleshoz Karelian isthmus ingest (interim)\n\n"
            "Intermediate state before full Lenoblast download. "
            "Karelian bbox covered, rest of the region still OSM."
        )
        log("── stage 1: done")
    else:
        log("skipping stage 1 (Karelian)")

    # ── Stage 2: full Lenoblast download ────────────────────────────────
    log("── stage 2: start full Lenoblast download (resume-aware)")
    download_full_lenoblast()

    log("── stage 2: convert all MVT tiles → GeoJSON")
    convert_to_geojson(GEOJSON_FULL)

    log("── stage 2: delete old rosleshoz rows")
    db_reset_rosleshoz()

    log("── stage 2: ingest full GeoJSON")
    ingest_geojson(GEOJSON_FULL, "fgislk-full-2026")

    log("── stage 2: rebuild PMTiles")
    rebuild_pmtiles()

    log("── stage 2: final git commit + push")
    git_commit_and_push(
        "Rosleshoz full Lenoblast ingest + PMTiles rebuild\n\n"
        "Taxation vydels from ФГИС ЛК cover the entire region now. "
        "Forest layer colors reflect real dominant species everywhere "
        "taxation data exists."
    )

    log("=" * 70)
    log("orchestrator FINISHED")
    log("=" * 70)


if __name__ == "__main__":
    main()
