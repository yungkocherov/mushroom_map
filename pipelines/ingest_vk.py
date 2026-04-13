"""
VK ingestion wrapper.

Phase 2 план:
    - Скопировать/адаптировать существующий парсер из ik_mushrooms_parser:
        src/collect_posts.py  → забирает посты группы через wall.get
        src/extract_dates.py  → регэкспы + LLM для foray_date
        src/classify_photos.py → LLM классификация видов по фото
    - Писать напрямую в postgres таблицу raw_posts и далее observation
      (с пустыми полями point/h3 — их заполнит extract_places)

На старте просто делаем обвязку над старым кодом через subprocess/import.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--group", help="VK group domain (override)")
    args = parser.parse_args()

    print(f"[phase 2] ingest_vk region={args.region} group={args.group}")
    raise SystemExit("Implemented in phase 2 — wraps ik_mushrooms_parser.")


if __name__ == "__main__":
    main()
