"""
check_fgislk_wfs: тест-доступа к WFS endpoint'у ФГИС ЛК.

Зачем: проверить что VPN выключен (RU IP) и WAF пускает на WFS.
Если 200 — печатает список FeatureType'ов, копируем имя слоя выделов
и идём дальше в pipelines/download_fgislk_wfs.py.

Запуск из VSCode:
    Открой этот файл, нажми ▷ Run Python File.

Или из терминала:
    .venv/Scripts/python.exe scripts/check_fgislk_wfs.py

Без зависимостей вне stdlib — чтобы запускался даже без активного venv.
"""
from __future__ import annotations

import sys
import json
import ssl
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET


def make_ssl_context() -> ssl.SSLContext:
    """
    Unverified TLS context. Российские госсайты часто используют
    Минцифра RootCA, которой нет ни в certifi, ни в Windows trust
    store у обычного Python install'а. Это ломает обычный
    ssl.create_default_context() с CERTIFICATE_VERIFY_FAILED.

    Это диагностический read-only скрипт (только GetCapabilities на
    публичный WFS) — MITM-риск минимальный, обмена секретов нет.
    Для prod-ingest'а в pipelines/download_fgislk_wfs.py надо взять
    Минцифра CA отдельно (или httpx с verify=False тоже подойдёт).
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

WFS_URL = (
    "https://pub.fgislk.gov.ru/map/geo/geoserver/wfs"
    "?service=WFS&version=2.0.0&request=GetCapabilities"
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


def check_ip(ssl_ctx: ssl.SSLContext) -> None:
    print("[1/2] Current IP / country")
    print("-" * 60)
    try:
        with urllib.request.urlopen(
            "https://ipinfo.io/json", timeout=10, context=ssl_ctx
        ) as r:
            info = json.load(r)
        print(f"  IP:      {info.get('ip')}")
        print(f"  Country: {info.get('country')}")
        print(f"  Org:     {info.get('org')}")
        print(f"  City:    {info.get('city')}")
        if info.get("country") != "RU":
            print()
            print("  WARNING: country is not RU. WFS will likely return 403.")
            print("  Disable AdGuard VPN (or add split-tunnel for")
            print("  pub.fgislk.gov.ru) and re-run.")
    except Exception as e:
        print(f"  ipinfo: ERROR {e}")
    print()


def check_wfs(ssl_ctx: ssl.SSLContext) -> int:
    print("[2/2] WFS GetCapabilities")
    print("-" * 60)
    print(f"  URL: {WFS_URL}")
    req = urllib.request.Request(
        WFS_URL,
        headers={
            "User-Agent": UA,
            "Referer": "https://pub.fgislk.gov.ru/map/",
            "Accept": "application/xml,text/xml,*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20, context=ssl_ctx) as r:
            xml_bytes = r.read()
            status = r.status
        print(f"  HTTP {status} - OK")
        print(f"  Body size: {len(xml_bytes):,} bytes")
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} - {e.reason}")
        body = e.read()[:300]
        print(f"  Body preview: {body!r}")
        return 1
    except Exception as e:
        print(f"  ERROR: {e}")
        return 1

    print()
    print("FeatureTypes (layers exposed by WFS):")
    print("-" * 60)
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"  XML parse error: {e}")
        print(f"  First 500 bytes: {xml_bytes[:500]!r}")
        return 1

    namespaces = (
        "http://www.opengis.net/wfs/2.0",
        "http://www.opengis.net/wfs",
    )
    features: list[tuple[str, str]] = []
    for ns in namespaces:
        for ft in root.iter(f"{{{ns}}}FeatureType"):
            name_el = ft.find(f"{{{ns}}}Name")
            title_el = ft.find(f"{{{ns}}}Title")
            if name_el is not None and name_el.text:
                features.append(
                    (name_el.text, title_el.text if title_el is not None else "")
                )

    if not features:
        print("  (no FeatureTypes found - unexpected XML structure)")
        print(f"  Root tag: {root.tag}")
        return 1

    for name, title in features:
        marker = ""
        lower = (name + " " + (title or "")).lower()
        if any(kw in lower for kw in ("vydel", "выдел", "taxation", "таксац")):
            marker = "  <-- likely vydel layer"
        print(f"  {name:55s}  {title or '':30s}{marker}")

    print()
    print(f"Total: {len(features)} FeatureTypes")
    print()
    print("Next step: pick the vydel-layer name above and run:")
    print("  .venv/Scripts/python.exe pipelines/download_fgislk_wfs.py \\")
    print("      --layer <name_above>")
    return 0


def main() -> int:
    ssl_ctx = make_ssl_context()
    check_ip(ssl_ctx)
    return check_wfs(ssl_ctx)


if __name__ == "__main__":
    sys.exit(main())
