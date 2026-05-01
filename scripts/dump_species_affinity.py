"""Dump species_forest_affinity table to a small JSON for mobile bundle.

Output (compact):

    {
      "schema_version": 1,
      "generated_at": "2026-05-01T22:00:00Z",
      "species": {
        "boletus-edulis": [
          {"tree": "pine", "affinity": 0.92},
          {"tree": "spruce", "affinity": 0.78},
          ...
        ],
        ...
      }
    }

Used by mobile popup'у `Виды по биотопу`: для tapped выдела с
`dominant_species=birch`, ищем все species с affinity к "birch" > 0.3,
показываем top-5. Лежит в apps/mobile/assets/species-affinity.json,
весит ~5-15 КБ.

Запуск:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe scripts/dump_species_affinity.py
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--out",
        type=Path,
        default=Path("apps/mobile/assets/species-affinity.json"),
    )
    p.add_argument(
        "--dsn",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
        ),
    )
    args = p.parse_args()

    sql = """
        SELECT
          s.slug             AS species,
          a.tree_species     AS tree,
          a.affinity         AS affinity
        FROM species_forest_affinity a
        JOIN species_registry s ON s.id = a.species_id
        WHERE a.affinity > 0
        ORDER BY s.slug, a.affinity DESC
    """
    with psycopg.connect(args.dsn) as conn, conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    by_species: dict[str, list[dict[str, object]]] = {}
    for sp, tree, aff in rows:
        if sp not in by_species:
            by_species[sp] = []
        by_species[sp].append({"tree": tree, "affinity": round(float(aff), 3)})

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "species": by_species,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    n_species = len(by_species)
    n_pairs = sum(len(v) for v in by_species.values())
    size_kb = args.out.stat().st_size / 1024
    print(
        f"OK: {n_species} видов, {n_pairs} affinity-pairs, "
        f"{size_kb:.1f} КБ -> {args.out}",
        flush=True,
    )


if __name__ == "__main__":
    main()
