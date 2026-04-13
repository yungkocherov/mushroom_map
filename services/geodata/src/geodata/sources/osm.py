"""
OSM ForestSource — загружает лесные полигоны через Overpass API.

Теги:
    landuse=forest  /  natural=wood
    leaf_type=needleleaved|broadleaved|mixed
    wood=pine|spruce|birch|...  (редко, но точно)

Зеркала Overpass (автопереключение при 429/5xx):
    https://overpass-api.de/api/interpreter
    https://overpass.kumi.systems/api/interpreter
    https://maps.mail.ru/osm/tools/overpass/api/interpreter
"""

from __future__ import annotations

import datetime as dt
import json
import time
from dataclasses import dataclass, field
from typing import Any, Iterator

import httpx
from shapely.geometry import (
    MultiPolygon, Polygon, mapping, shape
)
from shapely.ops import unary_union
from shapely.validation import make_valid

from geodata.sources.base import ForestSource, RawFeature
from geodata.types import BoundingBox, ForestTypeSlug, NormalizedForestPolygon

# ─── Маппинги тегов ──────────────────────────────────────────────────────────

OSM_WOOD_MAP: dict[str, ForestTypeSlug] = {
    "pine": "pine", "scots_pine": "pine", "pinus": "pine",
    "spruce": "spruce", "picea": "spruce", "ель": "spruce",
    "larch": "larch", "larix": "larch",
    "fir": "fir", "abies": "fir",
    "cedar": "cedar",
    "birch": "birch", "betula": "birch", "берёза": "birch", "береза": "birch",
    "aspen": "aspen", "populus_tremula": "aspen", "осина": "aspen",
    "alder": "alder", "alnus": "alder", "ольха": "alder",
    "oak": "oak", "quercus": "oak", "дуб": "oak",
    "linden": "linden", "tilia": "linden", "липа": "linden",
    "maple": "maple", "acer": "maple", "клён": "maple",
}

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

MIN_AREA_M2 = 5_000.0   # отбрасываем лоскуты < 0.5 га


# ─── Config ──────────────────────────────────────────────────────────────────

@dataclass
class OSMConfig:
    timeout_s: int = 300
    max_retries: int = 3
    retry_delay_s: float = 10.0
    min_area_m2: float = MIN_AREA_M2
    batch_size: int = 500           # элементов в одном запросе (для очень больших bbox)
    mirrors: list[str] = field(default_factory=lambda: list(OVERPASS_MIRRORS))


# ─── Source ───────────────────────────────────────────────────────────────────

class OSMForestSource(ForestSource):
    source_code = "osm"

    def __init__(self, config: OSMConfig | None = None) -> None:
        self.config = config or OSMConfig()
        self._fetched_at: dt.date = dt.date.today()

    @property
    def source_version(self) -> str:
        return f"osm-{self._fetched_at.isoformat()}"

    # ─── fetch ───────────────────────────────────────────────────────────────

    def fetch(self, bbox: BoundingBox) -> Iterator[RawFeature]:
        """Скачивает все лесные полигоны в bbox через Overpass API."""
        self._fetched_at = dt.date.today()
        query = self._build_query(bbox)
        data = self._overpass_request(query)

        elements: list[dict] = data.get("elements", [])
        print(f"  OSM: получено {len(elements)} элементов")

        # Индекс нод для сборки геометрий way/relation
        nodes: dict[int, tuple[float, float]] = {}
        ways: dict[int, list[int]] = {}

        for el in elements:
            if el["type"] == "node":
                nodes[el["id"]] = (el["lon"], el["lat"])
            elif el["type"] == "way":
                ways[el["id"]] = el.get("nodes", [])

        for el in elements:
            if el["type"] in ("way", "relation"):
                yield RawFeature(
                    source_feature_id=f"{el['type']}/{el['id']}",
                    payload={"element": el, "nodes": nodes, "ways": ways},
                )

    # ─── normalize ───────────────────────────────────────────────────────────

    def normalize(self, raw: RawFeature) -> NormalizedForestPolygon | None:
        el: dict = raw.payload["element"]
        nodes: dict = raw.payload["nodes"]
        ways: dict = raw.payload["ways"]

        try:
            geom = self._build_geometry(el, nodes, ways)
        except Exception as e:
            print(f"  WARN: геометрия {raw.source_feature_id}: {e}")
            return None

        if geom is None or geom.is_empty:
            return None

        # Площадь в м² через проекцию (грубо: 1° ≈ 111 км на широте 60°)
        lat_c = geom.centroid.y
        deg_to_m = 111_320.0
        lon_scale = deg_to_m * abs(__import__('math').cos(__import__('math').radians(lat_c)))
        area_m2 = geom.area * deg_to_m * lon_scale

        if area_m2 < self.config.min_area_m2:
            return None

        # Гарантируем MultiPolygon
        if isinstance(geom, Polygon):
            geom = MultiPolygon([geom])
        elif not isinstance(geom, MultiPolygon):
            geom = MultiPolygon([p for p in geom.geoms if isinstance(p, Polygon)])
            if geom.is_empty:
                return None

        tags = el.get("tags", {})
        dominant, confidence = self._classify_tags(tags)

        return NormalizedForestPolygon(
            source=self.source_code,
            source_feature_id=raw.source_feature_id,
            source_version=self.source_version,
            geometry_wkt=geom.wkt,
            dominant_species=dominant,
            species_composition=None,  # OSM не даёт точную смесь
            confidence=confidence,
            area_m2=round(area_m2, 1),
            meta={
                "osm_id": el["id"],
                "osm_type": el["type"],
                "tags": tags,
            },
        )

    # ─── geometry helpers ────────────────────────────────────────────────────

    def _build_geometry(
        self,
        el: dict,
        nodes: dict[int, tuple[float, float]],
        ways: dict[int, list[int]],
    ) -> MultiPolygon | Polygon | None:
        if el["type"] == "way":
            return self._way_to_polygon(el, nodes)
        elif el["type"] == "relation":
            return self._relation_to_multipolygon(el, nodes, ways)
        return None

    @staticmethod
    def _way_to_polygon(
        el: dict,
        nodes: dict[int, tuple[float, float]],
    ) -> Polygon | None:
        # Если в ответе есть geometry (out geom;) — берём оттуда
        if "geometry" in el:
            coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        else:
            node_ids = el.get("nodes", [])
            coords = [nodes[n] for n in node_ids if n in nodes]

        if len(coords) < 4:
            return None

        poly = Polygon(coords)
        if not poly.is_valid:
            poly = make_valid(poly)
        return poly if not poly.is_empty else None

    @staticmethod
    def _relation_to_multipolygon(
        el: dict,
        nodes: dict[int, tuple[float, float]],
        ways: dict[int, list[int]],
    ) -> MultiPolygon | None:
        outer_rings: list[list[tuple[float, float]]] = []
        inner_rings: list[list[tuple[float, float]]] = []

        for member in el.get("members", []):
            if member["type"] != "way":
                continue

            # geometry может быть инлайн в member (out geom;)
            if "geometry" in member:
                coords = [(p["lon"], p["lat"]) for p in member["geometry"]]
            else:
                wid = member["ref"]
                node_ids = ways.get(wid, [])
                coords = [nodes[n] for n in node_ids if n in nodes]

            if len(coords) < 4:
                continue

            role = member.get("role", "outer")
            if role == "outer":
                outer_rings.append(coords)
            elif role == "inner":
                inner_rings.append(coords)

        if not outer_rings:
            return None

        polys = []
        for outer in outer_rings:
            holes = [r for r in inner_rings if Polygon(outer).contains(Polygon(r).centroid)]
            poly = Polygon(outer, holes)
            if not poly.is_valid:
                poly = make_valid(poly)
            if not poly.is_empty:
                polys.append(poly)

        if not polys:
            return None

        merged = unary_union(polys)
        if isinstance(merged, Polygon):
            merged = MultiPolygon([merged])
        return merged if not merged.is_empty else None

    # ─── tag classification ──────────────────────────────────────────────────

    @staticmethod
    def _classify_tags(tags: dict[str, str]) -> tuple[ForestTypeSlug, float]:
        # 1. Конкретная порода в wood=
        wood = tags.get("wood", "").lower()
        if wood in OSM_WOOD_MAP:
            return OSM_WOOD_MAP[wood], 0.7

        # 2. leaf_type
        leaf = tags.get("leaf_type", "").lower()
        if leaf == "needleleaved":
            return "mixed_coniferous", 0.5
        if leaf == "broadleaved":
            return "mixed_broadleaved", 0.5
        if leaf == "mixed":
            return "mixed", 0.5

        # 3. species= (иногда заполняют латынью или по-русски)
        species_tag = tags.get("species", "").lower().split(";")[0].strip()
        if species_tag in OSM_WOOD_MAP:
            return OSM_WOOD_MAP[species_tag], 0.6

        return "unknown", 0.3

    def build_overpass_query(self, bbox: BoundingBox) -> str:
        s = bbox.overpass_bbox()
        return (
            f"[out:json][timeout:{self.config.timeout_s}];\n"
            f"(\n"
            f'  way["landuse"="forest"]({s});\n'
            f'  way["natural"="wood"]({s});\n'
            f'  relation["landuse"="forest"]({s});\n'
            f'  relation["natural"="wood"]({s});\n'
            f");\n"
            f"out geom;\n"
        )

    # Алиас для внешнего вызова
    _build_query = build_overpass_query

    # ─── HTTP ────────────────────────────────────────────────────────────────

    def _overpass_request(self, query: str) -> dict[str, Any]:
        last_err: Exception | None = None
        mirrors = list(self.config.mirrors)

        for attempt in range(self.config.max_retries):
            mirror = mirrors[attempt % len(mirrors)]
            try:
                print(f"  Overpass [{mirror}] попытка {attempt + 1}...")
                with httpx.Client(timeout=self.config.timeout_s) as client:
                    resp = client.post(mirror, data={"data": query})
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code in (429, 503, 504):
                    wait = self.config.retry_delay_s * (attempt + 1)
                    print(f"  HTTP {resp.status_code} — ждём {wait:.0f}с...")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_err = e
                wait = self.config.retry_delay_s
                print(f"  Сетевая ошибка: {e} — ждём {wait:.0f}с...")
                time.sleep(wait)

        raise RuntimeError(
            f"Overpass: все {self.config.max_retries} попытки провалились. "
            f"Последняя ошибка: {last_err}"
        )
