"""
Скачивает геометрии соседних субъектов РФ (Карелия, Новгородская,
Псковская, Тверская, Вологодская) через Overpass API.

Каждый subject — одна relation с boundary=administrative admin_level=4.
Собирается так же, как районы ЛО в download_districts_overpass.py:
outer-ways -> shapely.polygonize -> MultiPolygon.

Сохраняется в `data/osm/adjacent_subjects.geojson` для ingest'а через
ingest_adjacent_subjects.py.

Зачем: посты с mention'ом соседнего субъекта (Карелия 1285, Новгородская
1675, Псковская 982 и т.д.) сейчас хранятся только как текстовый маркер
в `place_match.detected_places`. Для forecast-модели полезно иметь
полноценные admin_area записи с геометрией и центроидом: позволит
считать weather и geo-фичи по центроиду субъекта и агрегировать target
по subject × date × group.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union


ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

SUBJECTS = [
    # (name_ru, name_en, code, timezone, alt_names_for_query)
    ("Республика Карелия",       "Karelia",            "karelia",
     "Europe/Petrozavodsk",
     ["Республика Карелия", "Карелия"]),
    ("Новгородская область",     "Novgorod Oblast",    "novgorod_oblast",
     "Europe/Moscow",
     ["Новгородская область"]),
    ("Псковская область",        "Pskov Oblast",       "pskov_oblast",
     "Europe/Moscow",
     ["Псковская область"]),
    ("Тверская область",         "Tver Oblast",        "tver_oblast",
     "Europe/Moscow",
     ["Тверская область"]),
    ("Вологодская область",      "Vologda Oblast",     "vologda_oblast",
     "Europe/Moscow",
     ["Вологодская область"]),
]


def query(name_ru: str) -> str:
    # name-based, level=4 = федеральный субъект РФ. Пробуем и по `name`, и по
    # `name:ru` — у Карелии основной `name` может быть финский или английский.
    return f"""[out:json][timeout:300];
(
  relation["boundary"="administrative"]["admin_level"="4"]["name"="{name_ru}"];
  relation["boundary"="administrative"]["admin_level"="4"]["name:ru"="{name_ru}"];
);
out geom;
"""


def close_ring(ring: list) -> list:
    if len(ring) >= 3 and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def relation_to_geom(rel: dict) -> dict | None:
    """outer-members -> MultiPolygon через shapely.polygonize."""
    outer_lines = []
    for m in rel.get("members") or []:
        if m.get("role") != "outer":
            continue
        coords = [(p["lon"], p["lat"]) for p in (m.get("geometry") or []) if p]
        if len(coords) >= 2:
            outer_lines.append(LineString(coords))
    if not outer_lines:
        return None
    merged = unary_union(outer_lines)
    polys = [p for p in polygonize(merged) if p.is_valid and not p.is_empty]
    if not polys:
        return None
    if len(polys) == 1:
        return mapping(polys[0])
    return {"type": "MultiPolygon", "coordinates": [mapping(p)["coordinates"] for p in polys]}


def fetch(query_str: str, timeout_s: int = 400) -> dict:
    data = query_str.encode("utf-8")
    last_err = None
    for ep in ENDPOINTS:
        try:
            print(f"  [{ep}]")
            req = urllib.request.Request(
                ep, data=data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "mushroom-map/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                return json.loads(resp.read())
        except Exception as e:
            last_err = e
            print(f"    FAILED: {type(e).__name__}: {e}")
            time.sleep(5)
            continue
    raise RuntimeError(f"all mirrors failed: {last_err}")


def main() -> None:
    features = []
    for name_ru, name_en, code, tz, alt_names in SUBJECTS:
        print(f"=== {name_ru} ===")
        rel = None
        data = None
        for nm in alt_names:
            try:
                data = fetch(query(nm))
            except Exception as e:
                print(f"  SKIP ({nm}): {e}")
                continue
            elems = [e for e in data.get("elements", []) if e.get("type") == "relation"]
            if elems:
                rel = elems[0]
                print(f"  found via name='{nm}' rel={rel.get('id')}")
                break
            else:
                print(f"  empty for name='{nm}'")
                time.sleep(2)
        if rel is None:
            print(f"  SKIP: not found in any of {alt_names}")
            continue
        geom = relation_to_geom(rel)
        if not geom:
            print("  no geometry")
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "osm_rel_id": rel.get("id"),
                "name_ru": name_ru,
                "name_en": name_en,
                "code": code,
                "timezone": tz,
                "admin_level": "4",
            },
            "geometry": geom,
        })
        print(f"  OK rel={rel.get('id')} geom={geom['type']}")

    os.makedirs("data/osm", exist_ok=True)
    out_path = "data/osm/adjacent_subjects.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f,
                  ensure_ascii=False, separators=(",", ":"))
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"\nsaved: {out_path} ({len(features)} subjects, {size_mb:.2f} MB)")
    print("next: python pipelines/ingest_adjacent_subjects.py")


if __name__ == "__main__":
    main()
