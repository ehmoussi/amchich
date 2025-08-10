"""Token management utilities."""

import datetime
import logging

import httpx
import jwt
from fastapi import Request
from pydantic import ValidationError

from app import cloudflare
from app.models import Settings, TokenPayload


def check_token(request: Request, settings: Settings) -> bool:
    token = extract_token_from_headers(request)
    try:
        payload = jwt.decode(
            token, settings.token_secret_key.get_secret_value(), algorithms=["HS256"]
        )
    except jwt.ExpiredSignatureError:
        msg = "Token has expired"
        raise ValueError(msg) from None
    except jwt.InvalidTokenError:
        msg = "Invalid token"
        raise ValueError(msg) from None
    else:
        try:
            payload = TokenPayload(**payload)
        except ValidationError:
            return False
    return True


def create_token(delta: datetime.timedelta, settings: Settings) -> bytes:
    issued_at = datetime.datetime.now(tz=datetime.UTC)
    expire_at = issued_at + delta
    payload = TokenPayload(issued_at=issued_at, expire_at=expire_at)
    return jwt.encode(
        payload.model_dump(mode="json"),
        settings.token_secret_key.get_secret_value(),
        algorithm="HS256",
    )


async def check_cloudflare_token(
    request: Request,
    client: httpx.AsyncClient | None,
    settings: Settings,
    logger: logging.Logger,
) -> bool:
    is_valid = False
    if (
        (request.url.path in ("/api/v1/health", "/favicon.ico") and request.method == "GET")
        or request.method == "OPTIONS"
        or settings.dev_mode
    ):
        is_valid = True
    elif client is None:
        logger.error("The httpx client is not available. Can't validate the token.")
        msg = "Can't validate the token"
        raise ValueError(msg)
    else:
        token = extract_token_from_headers(request)
        is_valid = await cloudflare.is_token_valid(
            token, settings.audience.get_secret_value(), settings.team_domain, client
        )
    return is_valid


def extract_token_from_headers(request: Request) -> str:
    token = request.headers.get("Authorization")
    if not token:
        msg = "Missing token"
        raise ValueError(msg)
    token = token.removeprefix("Bearer ")
    return token.strip()
