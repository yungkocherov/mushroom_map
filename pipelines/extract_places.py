"""
extract_places: привязка постов ВК к геометрии через NER + газеттир.

Вход: таблица raw_posts (или внешний parquet/csv из ik_mushrooms_parser)
Выход: observation.point, observation.h3_cell, observation.placename_raw/confidence

Phase 2 реализация: см. services/placenames.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--dsn", default=None)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    print(f"[phase 2] extract_places region={args.region}")
    # TODO:
    #  1. load posts (SELECT id, text FROM raw_posts WHERE ... )
    #  2. ner = PlacenameNER()
    #  3. for each post:
    #     a) try exact gazetteer match (lower + unaccent + pg_trgm similarity)
    #     b) else ner.extract() → lookup gazetteer by mention
    #     c) if found → set observation.point = gazetteer.point, h3_cell = H3(point, 7)
    #  4. REFRESH MATERIALIZED VIEW observation_h3_species_stats
    raise SystemExit("Implemented in phase 2.")


if __name__ == "__main__":
    main()
