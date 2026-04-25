"""
OAuth state-JWT round-trip — мини-юнит-тесты вокруг encode_oauth_state /
decode_oauth_state. Это тонкая, но критичная часть auth-flow:
state — единственное место, где переносится PKCE-verifier через
редирект к Yandex и обратно.

Не требует БД и API — чистая работа с PyJWT. Скипается только если
pyjwt не установлен.
"""

from __future__ import annotations

import time

import pytest

try:
    import jwt as pyjwt
except ImportError:
    pytest.skip("pyjwt not installed", allow_module_level=True)


# Подкладываем такой же дефолт что и в settings.py — чтобы локальное
# поведение совпадало с running API.
JWT_SECRET = "change-me-in-production-a-long-random-string"
JWT_ISSUER = "mushroom-map"
ALGO = "HS256"


def _encode(payload: dict, secret: str = JWT_SECRET, alg: str = ALGO) -> str:
    """Локальная копия encode_oauth_state — нужна для негативных кейсов
    (другой секрет, другой alg, другой typ). Реальный encode/decode из
    src/api/auth/jwt_tokens.py — через httpx-вызов в integration suite."""
    now = int(time.time())
    return pyjwt.encode(
        {
            **payload,
            "iss": JWT_ISSUER,
            "iat": now,
            "exp": now + 600,
            "typ": "oauth_state",
        },
        secret,
        algorithm=alg,
    )


def _decode_with_settings(token: str) -> dict:
    """Зеркало api.auth.jwt_tokens.decode_oauth_state без импорта package."""
    payload = pyjwt.decode(
        token,
        JWT_SECRET,
        algorithms=[ALGO],
        issuer=JWT_ISSUER,
        options={"require": ["exp", "iat", "iss"]},
    )
    if payload.get("typ") != "oauth_state":
        raise pyjwt.InvalidTokenError("wrong token type")
    return payload


def test_round_trip_preserves_pkce_verifier() -> None:
    verifier = "x" * 64
    token = _encode({"nonce": "abc", "pkce_verifier": verifier})
    decoded = _decode_with_settings(token)
    assert decoded["pkce_verifier"] == verifier
    assert decoded["nonce"] == "abc"
    assert decoded["typ"] == "oauth_state"


def test_wrong_secret_rejected() -> None:
    token = _encode({"nonce": "abc", "pkce_verifier": "v"}, secret="other-secret")
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(token)


def test_expired_state_rejected() -> None:
    """exp в прошлом → InvalidTokenError (ExpiredSignatureError тоже подкласс)."""
    now = int(time.time())
    token = pyjwt.encode(
        {
            "nonce": "abc", "pkce_verifier": "v",
            "iss": JWT_ISSUER, "iat": now - 3600, "exp": now - 60,
            "typ": "oauth_state",
        },
        JWT_SECRET, algorithm=ALGO,
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(token)


def test_wrong_typ_rejected() -> None:
    """Access-JWT не должен пройти декод как state — typ-маркер охраняет."""
    now = int(time.time())
    access_jwt = pyjwt.encode(
        {
            "iss": JWT_ISSUER, "iat": now, "exp": now + 900,
            "sub": "00000000-0000-0000-0000-000000000000",
            "typ": "access",  # ← намеренно НЕ oauth_state
        },
        JWT_SECRET, algorithm=ALGO,
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(access_jwt)


def test_wrong_issuer_rejected() -> None:
    now = int(time.time())
    token = pyjwt.encode(
        {
            "nonce": "abc", "pkce_verifier": "v",
            "iss": "evil-issuer",
            "iat": now, "exp": now + 600,
            "typ": "oauth_state",
        },
        JWT_SECRET, algorithm=ALGO,
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(token)


def test_garbage_token_rejected() -> None:
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings("not.a.jwt")


def test_missing_required_claim_rejected() -> None:
    """exp обязателен — без него decode_oauth_state кидает."""
    token = pyjwt.encode(
        {"iss": JWT_ISSUER, "iat": int(time.time()), "typ": "oauth_state"},
        JWT_SECRET, algorithm=ALGO,
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(token)


def test_alg_none_rejected() -> None:
    """Старая CVE-семейка: alg=none. PyJWT по умолчанию её отвергает."""
    # Сконструируем вручную — encode с алгоритмом 'none' тоже работает.
    token = pyjwt.encode(
        {"iss": JWT_ISSUER, "iat": int(time.time()),
         "exp": int(time.time()) + 600, "typ": "oauth_state"},
        key="",
        algorithm="none",
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        _decode_with_settings(token)
