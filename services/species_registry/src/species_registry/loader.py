"""
Загрузчик species_registry.yaml → таблицы species и species_forest_affinity.

Использование:
    python -m species_registry.loader --yaml db/seeds/species_registry.yaml

Идемпотентно: ON CONFLICT (slug) UPDATE. Перезапуск безопасен.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import psycopg
import yaml


VALID_FOREST_SLUGS = {
    "pine", "spruce", "larch", "fir", "cedar",
    "birch", "aspen", "alder", "oak", "linden", "maple",
    "mixed_coniferous", "mixed_broadleaved", "mixed", "unknown",
}


def load_yaml(path: Path) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    species = data.get("species", [])
    if not isinstance(species, list):
        raise ValueError(f"{path}: ключ 'species' должен быть списком")
    return species


def validate(entry: dict[str, Any]) -> None:
    required = {"slug", "name_ru", "edibility"}
    missing = required - entry.keys()
    if missing:
        raise ValueError(f"Species {entry.get('slug')!r}: нет полей {missing}")

    for f in entry.get("forests", []):
        if f["type"] not in VALID_FOREST_SLUGS:
            raise ValueError(
                f"Species {entry['slug']}: forest type {f['type']!r} не канонический. "
                f"Допустимы: {sorted(VALID_FOREST_SLUGS)}"
            )
        if not 0 <= f["affinity"] <= 1:
            raise ValueError(f"Species {entry['slug']}: affinity вне [0,1]: {f['affinity']}")


def upsert_species(conn: psycopg.Connection, entry: dict[str, Any]) -> int:
    cur = conn.execute(
        """
        INSERT INTO species (
            slug, name_ru, name_lat, synonyms, genus, family,
            edibility, season_months, description, photo_url, wiki_url, red_book
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET
            name_ru = EXCLUDED.name_ru,
            name_lat = EXCLUDED.name_lat,
            synonyms = EXCLUDED.synonyms,
            genus = EXCLUDED.genus,
            family = EXCLUDED.family,
            edibility = EXCLUDED.edibility,
            season_months = EXCLUDED.season_months,
            description = EXCLUDED.description,
            photo_url = EXCLUDED.photo_url,
            wiki_url = EXCLUDED.wiki_url,
            red_book = EXCLUDED.red_book,
            updated_at = now()
        RETURNING id;
        """,
        (
            entry["slug"],
            entry["name_ru"],
            entry.get("name_lat"),
            entry.get("synonyms", []),
            entry.get("genus"),
            entry.get("family"),
            entry["edibility"],
            entry.get("season_months", []),
            entry.get("description"),
            entry.get("photo_url"),
            entry.get("wiki_url"),
            bool(entry.get("red_book", False)),
        ),
    )
    species_id = cur.fetchone()[0]

    # Affinity: полностью перезаписываем связи для этого вида
    conn.execute("DELETE FROM species_forest_affinity WHERE species_id = %s", (species_id,))
    for f in entry.get("forests", []):
        conn.execute(
            """
            INSERT INTO species_forest_affinity (species_id, forest_type, affinity, note)
            VALUES (%s, %s, %s, %s)
            """,
            (species_id, f["type"], float(f["affinity"]), f.get("note")),
        )
    return species_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yaml", type=Path, default=Path("db/seeds/species_registry.yaml"))
    parser.add_argument("--dsn", type=str, default=None,
                        help="Postgres DSN; если не задан — берём $DATABASE_URL")
    args = parser.parse_args()

    import os
    dsn = args.dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL не задан и --dsn не передан")

    species = load_yaml(args.yaml)
    for entry in species:
        validate(entry)

    with psycopg.connect(dsn, autocommit=False) as conn:
        for entry in species:
            upsert_species(conn, entry)
        conn.commit()

    print(f"Загружено видов: {len(species)}")


if __name__ == "__main__":
    main()
