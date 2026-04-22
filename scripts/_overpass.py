"""Shared Overpass POST client for download_*_overpass.py scripts.

Stdlib-only (urllib) — чтобы scripts/ не тянули httpx как зависимость.
Канонический клиент с httpx живёт в `services/placenames/.../gazetteer.py`
для пакета placenames; `scripts/` пусть остаётся zero-dep.

Что делает:
  - Перебирает MIRRORS по очереди.
  - На 429/503/504 ждёт `10 * (attempt+1)` секунд и пробует следующий mirror.
  - На 4xx логирует и сразу переходит к следующему mirror без ожидания.
  - На сетевых ошибках (timeout / urlerror) ждёт 10 с и повторяет.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

USER_AGENT = "mushroom-map/1.0"
DEFAULT_TIMEOUT_S = 400


def overpass_post(
    query: str,
    *,
    timeout_s: int = DEFAULT_TIMEOUT_S,
    max_retries: int = 3,
    log_prefix: str = "  ",
) -> dict:
    """POST query to Overpass; return parsed JSON dict.

    Raises RuntimeError after `max_retries` cycles through all mirrors.
    `query` — обычный Overpass-QL текст, encoding в utf-8 — наша забота.
    """
    body = query.encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
    }
    last_err: Exception | None = None
    total = max_retries * len(OVERPASS_MIRRORS)
    for attempt in range(total):
        mirror = OVERPASS_MIRRORS[attempt % len(OVERPASS_MIRRORS)]
        cycle = attempt // len(OVERPASS_MIRRORS) + 1
        try:
            print(f"{log_prefix}Overpass [{mirror}] cycle {cycle}", flush=True)
            req = urllib.request.Request(mirror, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 503, 504):
                wait = 10 * cycle
                print(f"{log_prefix}HTTP {e.code} — wait {wait}s", flush=True)
                time.sleep(wait)
            else:
                print(f"{log_prefix}HTTP {e.code} — next mirror", flush=True)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            print(f"{log_prefix}Network error: {e} — wait 10s", flush=True)
            time.sleep(10)
    raise RuntimeError(f"Overpass: all mirrors failed ({last_err})")


def overpass_elements(query: str, **kwargs) -> list[dict]:
    """Convenience: POST + return data['elements'] (or empty list)."""
    data = overpass_post(query, **kwargs)
    return data.get("elements") or []
