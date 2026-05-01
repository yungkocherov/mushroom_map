"""Pure-unit tests for device_token (mobile-app long-lived JWT).

Not testing HTTP — that lives in smoke/integration tests against a
running API. These verify that:
- device_token round-trips through encode/decode_access_token
- device_id is preserved in payload
- TTL уважается
- access-token и device-token не путаются
"""

from __future__ import annotations

import time
from uuid import UUID

import jwt
import pytest

from api.auth import jwt_tokens
from api.settings import settings


def test_device_token_roundtrips_to_user_id() -> None:
    user_id = UUID("12345678-1234-1234-1234-123456789abc")
    token, ttl = jwt_tokens.encode_device_token(user_id, "device-abc-123")
    assert ttl == settings.device_token_ttl_seconds
    assert jwt_tokens.decode_access_token(token) == user_id


def test_device_token_carries_device_id() -> None:
    user_id = UUID("12345678-1234-1234-1234-123456789abc")
    token, _ = jwt_tokens.encode_device_token(user_id, "deviceXYZ")
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
    )
    assert payload["did"] == "deviceXYZ"
    assert payload["typ"] == "device"


def test_device_token_ttl_is_one_year_default() -> None:
    user_id = UUID("12345678-1234-1234-1234-123456789abc")
    token, ttl = jwt_tokens.encode_device_token(user_id, "d-1")
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
    )
    assert payload["exp"] - payload["iat"] == ttl
    # ~1 год по умолчанию (365 * 86400)
    assert ttl >= 300 * 86400


def test_access_decoder_rejects_random_token() -> None:
    with pytest.raises(jwt_tokens.AccessTokenInvalid):
        jwt_tokens.decode_access_token("not-a-jwt")


def test_access_decoder_rejects_other_typ() -> None:
    payload = {
        "iss": settings.jwt_issuer,
        "sub": "12345678-1234-1234-1234-123456789abc",
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
        "typ": "oauth_state",  # not access nor device
    }
    bad = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(jwt_tokens.AccessTokenInvalid):
        jwt_tokens.decode_access_token(bad)
