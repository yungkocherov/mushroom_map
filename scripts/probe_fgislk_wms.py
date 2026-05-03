"""
probe_fgislk_wms: тестирует ФГИС WMS GetFeatureInfo по точке юзера.

Цель — проверить что WMS работает там где WFS блокирован, и увидеть
какие properties выделов отдаёт сервер. Если работает — пишем
полноценный bulk-scraper в pipelines/.

Запуск из VSCode: ▷ Run Python File.
"""
from __future__ import annotations

import json
import math
import ssl
import urllib.parse
import urllib.request

# Точка юзера (ФГИС Map shows выдел №17, sosna, 2.5 ha)
LAT, LON = 60.32314, 29.39368

WMS_URL = "https://pub.fgislk.gov.ru/map/geo/geoserver/wms"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)


def deg_to_3857(lat: float, lon: float) -> tuple[float, float]:
    """EPSG:4326 → EPSG:3857 (Web Mercator)."""
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.34 / 180
    return x, y


def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def probe_point(lat: float, lon: float, *, radius_m: float = 50.0) -> None:
    """Один WMS GetFeatureInfo запрос на квадрат вокруг точки."""
    cx, cy = deg_to_3857(lat, lon)
    # Bbox ±radius_m вокруг точки в Web-Mercator. Curl-пример юзера
    # использовал прямоугольник ~283м × 283м (281m × 281m по разнице
    # bbox координат). Делаем small-radius для точечного тестирования.
    bbox = f"{cx - radius_m},{cy - radius_m},{cx + radius_m},{cy + radius_m}"

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "QUERY_LAYERS": "FOREST_LAYERS:TAXATION_PIECE",
        "LAYERS": "FOREST_LAYERS:TAXATION_PIECE",
        "INFO_FORMAT": "application/json",
        "FEATURE_COUNT": "1001",
        # БЕЗ propertyName — хотим увидеть все поля (юзеровский запрос
        # ограничивал label_name; нам нужно полное feature)
        "I": "50",
        "J": "50",
        "CRS": "EPSG:3857",
        "STYLES": "",
        "WIDTH": "101",
        "HEIGHT": "101",
        "BBOX": bbox,
    }

    body = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(
        WMS_URL,
        data=body,
        method="POST",
        headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://pub.fgislk.gov.ru",
            "Referer": "https://pub.fgislk.gov.ru/map/",
        },
    )

    print(f"POST {WMS_URL}")
    print(f"  bbox (3857): {bbox}")
    print(f"  query_layer: FOREST_LAYERS:TAXATION_PIECE")
    print()

    try:
        with urllib.request.urlopen(req, timeout=20, context=make_ssl_context()) as r:
            status = r.status
            content_type = r.headers.get("Content-Type", "?")
            data = r.read()
    except Exception as e:
        print(f"ERROR: {e}")
        return

    print(f"HTTP {status}  Content-Type: {content_type}  Size: {len(data):,} bytes")
    print("-" * 60)

    if "json" not in content_type.lower():
        print(data[:500])
        return

    try:
        fc = json.loads(data)
    except Exception as e:
        print(f"JSON parse error: {e}")
        print(data[:500])
        return

    features = fc.get("features", [])
    print(f"Features: {len(features)}")
    print()
    for i, feat in enumerate(features):
        print(f"=== Feature #{i + 1} ===")
        print(f"  id: {feat.get('id')}")
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates")
        if gtype:
            # Кратко — тип + примерное количество вершин (без дампа полигона)
            def count_pts(c):
                if isinstance(c, list):
                    if c and isinstance(c[0], (int, float)):
                        return 1
                    return sum(count_pts(x) for x in c)
                return 0
            print(f"  geometry: {gtype}, ~{count_pts(coords)} points")
        props = feat.get("properties") or {}
        print(f"  properties ({len(props)} fields):")
        for k, v in props.items():
            v_str = repr(v)
            if len(v_str) > 80:
                v_str = v_str[:77] + "..."
            print(f"    {k}: {v_str}")
        print()


def probe_attributesinfo(object_id: int) -> None:
    """
    Дёргает детальный API ФГИС для одного выдела.
    URL: /map/geo/map_api/layer/attributesinfo?layer_code=TAXATION_PIECE&object_id=<id>

    object_id — численная часть WMS feature id (TAXATION_PIECE.109084231 → 109084231).
    """
    url = (
        "https://pub.fgislk.gov.ru/map/geo/map_api/layer/attributesinfo"
        f"?layer_code=TAXATION_PIECE&object_id={object_id}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Referer": "https://pub.fgislk.gov.ru/map/",
        },
    )
    print(f"GET {url}")
    try:
        with urllib.request.urlopen(req, timeout=20, context=make_ssl_context()) as r:
            status = r.status
            content_type = r.headers.get("Content-Type", "?")
            data = r.read()
    except Exception as e:
        print(f"ERROR: {e}")
        return

    print(f"HTTP {status}  Content-Type: {content_type}  Size: {len(data):,} bytes")
    print("-" * 60)

    try:
        payload = json.loads(data)
    except Exception as e:
        print(f"JSON parse error: {e}")
        print(data[:1000])
        return

    print(json.dumps(payload, ensure_ascii=False, indent=2)[:4000])


if __name__ == "__main__":
    print("=" * 60)
    print("Test 1: WMS GetFeatureInfo at user's point (geometry + id)")
    print("=" * 60)
    probe_point(LAT, LON, radius_m=50)

    print()
    print("=" * 60)
    print("Test 2: attributesinfo for object_id=109084231 (full props)")
    print("=" * 60)
    probe_attributesinfo(109084231)
