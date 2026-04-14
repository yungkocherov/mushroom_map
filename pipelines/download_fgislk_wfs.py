"""
download_fgislk_wfs: качает таксационные выделы с публичного WFS ФГИС ЛК.

ФГИС ЛК модуль «Публичная лесная карта» (https://pub.fgislk.gov.ru/map/)
выставляет наружу стандартный GeoServer WFS endpoint:

    https://pub.fgislk.gov.ru/map/geo/geoserver/wfs

Данные (кварталы, выделы с породным составом, границы лесничеств)
доступны без авторизации. ОДНАКО: Cloudflare/WAF перед сервером,
по-видимому, режет запросы с не-российских IP. Если у тебя VPN — **выключи
его** перед запуском этого скрипта, иначе получишь HTTP 403.

Что делает:
    1. Запрашивает GetCapabilities, парсит список FeatureType'ов.
    2. Ищет слой с таксационными выделами (по имени / по атрибутам).
       Если автоопределение не сработает — показывает список слоёв и
       просит передать --layer явно.
    3. Делает GetFeature с bbox Ленобласти и outputFormat=application/json.
    4. Сохраняет в data/rosleshoz/fgislk_wfs_<layer>.geojson.
    5. Показывает первые несколько features с атрибутами, чтобы ты мог
       увидеть, как называется поле с формулой.

Потом запускаешь:

    python pipelines/ingest_forest.py --source rosleshoz --region lenoblast \\
        --rosleshoz-file data/rosleshoz/fgislk_wfs_<layer>.geojson \\
        --rosleshoz-formula-field <имя_поля_с_формулой> \\
        --rosleshoz-version fgislk-2026

Использование:
    python pipelines/download_fgislk_wfs.py                  # bbox Ленобласти
    python pipelines/download_fgislk_wfs.py --list-layers    # только список слоёв
    python pipelines/download_fgislk_wfs.py --layer forestry:vydels
    python pipelines/download_fgislk_wfs.py --bbox 28,58.5,33,61.8
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import httpx

WFS_URL = "https://pub.fgislk.gov.ru/map/geo/geoserver/wfs"
DEFAULT_BBOX_LENOBLAST = (27.8, 58.5, 33.0, 61.8)   # (west, south, east, north)
OUT_DIR = Path(__file__).parent.parent / "data" / "rosleshoz"

#: Браузерные заголовки — без них WAF режет запросы на http-level
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://pub.fgislk.gov.ru/map/",
    "Accept": "application/xml, text/xml, application/json, */*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

WFS_NS = {
    "wfs": "http://www.opengis.net/wfs/2.0",
    "wfs11": "http://www.opengis.net/wfs",
    "ows": "http://www.opengis.net/ows/1.1",
    "xsd": "http://www.w3.org/2001/XMLSchema",
}

VYDEL_KEYWORDS = (
    "выдел", "vydel", "stand", "tax",
    "лесотакс", "forestry", "forest_stand",
)


def _client() -> httpx.Client:
    return httpx.Client(
        verify=False,          # govt cert chain часто нестандартный
        timeout=180,
        headers=BROWSER_HEADERS,
        follow_redirects=True,
    )


def _check_403(r: httpx.Response) -> None:
    if r.status_code == 403:
        raise SystemExit(
            "\nHTTP 403 Forbidden. Скорее всего твой VPN направляет трафик\n"
            "через не-российский IP, а WAF перед ФГИС ЛК режет такие запросы.\n"
            "\n"
            "Что делать:\n"
            "  1. Отключи VPN (или переключи на российский exit).\n"
            "  2. Проверь: открой https://pub.fgislk.gov.ru/map/ в браузере,\n"
            "     карта должна показать данные и не выдать 403.\n"
            "  3. Запусти этот скрипт ещё раз.\n"
        )
    r.raise_for_status()


def get_capabilities(client: httpx.Client, *, version: str = "2.0.0") -> str:
    print(f"[WFS] GetCapabilities version={version}...")
    r = client.get(WFS_URL, params={
        "service": "WFS",
        "version": version,
        "request": "GetCapabilities",
    })
    _check_403(r)
    print(f"  ok, {len(r.content)} bytes")
    return r.text


def parse_feature_types(capabilities_xml: str) -> list[dict]:
    """Возвращает список FeatureType'ов с name/title/crs/bbox."""
    try:
        root = ET.fromstring(capabilities_xml)
    except ET.ParseError as e:
        raise SystemExit(f"не распарсил GetCapabilities XML: {e}")

    # FeatureType встречается в разных namespace в зависимости от версии
    candidates = [
        ".//{http://www.opengis.net/wfs/2.0}FeatureType",
        ".//{http://www.opengis.net/wfs}FeatureType",
    ]
    features: list[dict] = []
    for xp in candidates:
        for ft in root.findall(xp):
            name = _text(ft, "{http://www.opengis.net/wfs/2.0}Name") or \
                   _text(ft, "{http://www.opengis.net/wfs}Name")
            title = _text(ft, "{http://www.opengis.net/wfs/2.0}Title") or \
                    _text(ft, "{http://www.opengis.net/wfs}Title")
            abstract = _text(ft, "{http://www.opengis.net/wfs/2.0}Abstract") or \
                       _text(ft, "{http://www.opengis.net/wfs}Abstract")
            features.append({
                "name": name,
                "title": title or "",
                "abstract": abstract or "",
            })
    return features


def _text(parent, tag: str) -> Optional[str]:
    el = parent.find(tag)
    return el.text.strip() if el is not None and el.text else None


def guess_vydel_layer(features: list[dict]) -> Optional[dict]:
    """Ищет слой с таксационными выделами по ключевым словам."""
    for f in features:
        hay = " ".join(filter(None, [
            (f.get("name") or "").lower(),
            (f.get("title") or "").lower(),
            (f.get("abstract") or "").lower(),
        ]))
        for kw in VYDEL_KEYWORDS:
            if kw in hay:
                return f
    return None


def get_feature(
    client: httpx.Client,
    layer: str,
    bbox: tuple[float, float, float, float],
    *,
    version: str = "2.0.0",
    max_features: Optional[int] = None,
) -> bytes:
    """Скачивает GeoJSON через WFS GetFeature."""
    west, south, east, north = bbox
    # WFS 2.0: typeNames; 1.1/1.0: typeName. Заголовки bbox тоже разные.
    params = {
        "service": "WFS",
        "version": version,
        "request": "GetFeature",
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
    }
    if version.startswith("2"):
        params["typeNames"] = layer
        params["bbox"] = f"{south},{west},{north},{east},EPSG:4326"
    else:
        params["typeName"] = layer
        params["bbox"] = f"{west},{south},{east},{north},EPSG:4326"
    if max_features:
        if version.startswith("2"):
            params["count"] = str(max_features)
        else:
            params["maxFeatures"] = str(max_features)

    print(f"[WFS] GetFeature {layer=} bbox={bbox} max={max_features}...")
    r = client.get(WFS_URL, params=params)
    _check_403(r)
    return r.content


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-layers", action="store_true",
                    help="Только показать список FeatureType'ов и выйти")
    ap.add_argument("--layer", default=None,
                    help="Имя слоя WFS (если не задано — автоопределение)")
    ap.add_argument("--bbox", default=None,
                    help="west,south,east,north (по умолчанию Ленобласть)")
    ap.add_argument("--version", default="2.0.0",
                    help="Версия WFS (2.0.0 / 1.1.0 / 1.0.0)")
    ap.add_argument("--max", type=int, default=None,
                    help="Макс. features в одном ответе (для теста/пагинации)")
    ap.add_argument("--out", default=None,
                    help="Куда сохранить .geojson (по умолчанию data/rosleshoz/)")
    args = ap.parse_args()

    bbox: tuple[float, float, float, float]
    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        if len(parts) != 4:
            raise SystemExit("--bbox должно быть 'west,south,east,north'")
        bbox = tuple(parts)  # type: ignore[assignment]
    else:
        bbox = DEFAULT_BBOX_LENOBLAST

    with _client() as client:
        caps = get_capabilities(client, version=args.version)
        features = parse_feature_types(caps)
        print(f"\nFeatureType'ов найдено: {len(features)}")
        for f in features[:50]:
            print(f"  - {f['name']!r:40s}  {f['title'][:60]}")

        if args.list_layers:
            return

        layer = args.layer
        if not layer:
            guess = guess_vydel_layer(features)
            if guess:
                layer = guess["name"]
                print(f"\nАвтоопределил слой выделов: {layer}")
                print(f"  title: {guess['title']}")
            else:
                raise SystemExit(
                    "\nНе удалось автоопределить слой с выделами. "
                    "Посмотри список выше и запусти ещё раз с --layer <name>."
                )

        content = get_feature(client, layer, bbox, version=args.version,
                              max_features=args.max)

        out = Path(args.out) if args.out else (
            OUT_DIR / f"fgislk_wfs_{layer.replace(':', '_')}.geojson"
        )
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(content)
        print(f"\nсохранено: {out} ({out.stat().st_size / 1024:.0f} КБ)")

        # Покажем первые features и их атрибуты
        try:
            import json
            data = json.loads(content.decode("utf-8"))
            feats = data.get("features", [])
            print(f"features в ответе: {len(feats)}")
            if feats:
                first = feats[0]
                print("\nПример фичи:")
                print(f"  type: {first.get('geometry', {}).get('type')}")
                props = first.get("properties", {})
                print(f"  properties ({len(props)} полей):")
                for k, v in list(props.items())[:30]:
                    vs = str(v)
                    if len(vs) > 60:
                        vs = vs[:57] + "..."
                    print(f"    {k}: {vs}")
        except Exception as e:
            print(f"не смог пропарсить GeoJSON для preview: {e}")


if __name__ == "__main__":
    main()
