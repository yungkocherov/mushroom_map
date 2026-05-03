"""
probe_fgislk_wfs: тест WFS GetFeature и DescribeFeatureType на ФГИС.

Гипотеза: WAF блокирует WFS `request=GetCapabilities`, но НЕ блокирует
`request=GetFeature` / `DescribeFeatureType`. Если так — WFS отдаёт
полное feature со всеми полями (возможно включая полную sost_formula),
причём пакетом до FEATURE_COUNT штук за один запрос — это лучше чем
WMS GetFeatureInfo (1 feature за click) + attributesinfo (отдельный
запрос за каждым).

Тест:
  1. DescribeFeatureType — показывает все поля layer'а TAXATION_PIECE
  2. GetFeature с bbox вокруг точки юзера — собственно фичи

Запуск из VSCode: ▷ Run Python File.
"""
from __future__ import annotations

import json
import math
import ssl
import urllib.parse
import urllib.request

LAT, LON = 60.32314, 29.39368

WFS_URL = "https://pub.fgislk.gov.ru/map/geo/geoserver/wfs"
TYPE_NAME = "FOREST_LAYERS:TAXATION_PIECE"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)


def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch(url: str) -> tuple[int, bytes, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Referer": "https://pub.fgislk.gov.ru/map/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=make_ssl_context()) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "?")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "?")


def deg_to_3857(lat: float, lon: float) -> tuple[float, float]:
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.34 / 180
    return x, y


def test_describe() -> None:
    print("=" * 60)
    print("Test 1: DescribeFeatureType — какие поля есть у TAXATION_PIECE")
    print("=" * 60)
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "DescribeFeatureType",
        "typeName": TYPE_NAME,
    }
    url = f"{WFS_URL}?{urllib.parse.urlencode(params)}"
    print(f"GET {url}")
    status, data, ct = fetch(url)
    print(f"HTTP {status}  Content-Type: {ct}  Size: {len(data):,} bytes")
    print("-" * 60)
    text = data.decode("utf-8", errors="replace")
    # Краткий вывод — первые 80 строк
    lines = text.splitlines()
    for line in lines[:80]:
        print(line)
    if len(lines) > 80:
        print(f"  ... ещё {len(lines) - 80} строк")
    print()


def test_get_feature_bbox() -> None:
    print("=" * 60)
    print("Test 2: GetFeature с bbox 1km вокруг точки юзера")
    print("=" * 60)
    cx, cy = deg_to_3857(LAT, LON)
    half = 500.0  # 1km × 1km bbox
    bbox = f"{cx - half},{cy - half},{cx + half},{cy + half},EPSG:3857"
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": TYPE_NAME,
        "bbox": bbox,
        "outputFormat": "application/json",
        "count": "200",
    }
    url = f"{WFS_URL}?{urllib.parse.urlencode(params)}"
    print(f"GET {url}")
    status, data, ct = fetch(url)
    print(f"HTTP {status}  Content-Type: {ct}  Size: {len(data):,} bytes")
    print("-" * 60)

    if status != 200:
        print(data[:500])
        return

    if "json" not in ct.lower():
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

    # Для первого feature — печатаем все properties
    if features:
        feat = features[0]
        print()
        print(f"=== Feature #1 (id={feat.get('id')}) ===")
        geom = feat.get("geometry") or {}
        print(f"  geometry: {geom.get('type')}")
        props = feat.get("properties") or {}
        print(f"  properties ({len(props)} fields):")
        for k, v in props.items():
            v_str = repr(v)
            if len(v_str) > 120:
                v_str = v_str[:117] + "..."
            print(f"    {k}: {v_str}")

    # Если features больше — кратко по второму чтобы видеть что
    # bbox-запрос реально пакетный
    if len(features) > 1:
        print()
        print(f"=== Feature #2 (id={features[1].get('id')}) — краткий props ===")
        props = features[1].get("properties") or {}
        for k in list(props.keys())[:5]:
            print(f"    {k}: {props[k]!r}")
        print(f"    ... ({len(props)} полей всего)")


if __name__ == "__main__":
    test_describe()
    test_get_feature_bbox()
