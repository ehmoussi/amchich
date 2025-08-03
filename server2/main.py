import asyncio
import datetime
import logging
import math
import sys
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from httpx import AsyncClient
from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

import cloudflare
import db
import encrypt
import expire


class Settings(BaseSettings):
    dev_mode: int
    prod_port: int
    dev_port: int
    frontend_prod_url: str
    frontend_dev_url: str
    frontend_dev_url_2: str
    openrouter_api_key: SecretStr
    openrouter_prov_api_key: SecretStr
    openrouter_key_salt: SecretStr
    openrouter_base_url: str
    team_domain: str
    Audience: SecretStr

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


_SETTINGS = Settings()  # pyright: ignore[reportCallIssue]

_LOGGER = logging.getLogger("amchich")
_LOGGER.addHandler(logging.StreamHandler(sys.stdout))

if _SETTINGS.dev_mode:
    _LOGGER.setLevel(logging.DEBUG)
else:
    _LOGGER.setLevel(logging.INFO)

_ORIGINS: list[str] = (
    [
        f"{_SETTINGS.frontend_dev_url}",
        f"{_SETTINGS.frontend_dev_url_2}",
    ]
    if _SETTINGS.dev_mode
    else [
        f"{_SETTINGS.frontend_prod_url}",
    ]
)

_CLIENT = AsyncClient(timeout=20)
_BACKGROUND_TASKS: set[asyncio.Task[None]] = set()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    await db.create_db_and_tables()
    _BACKGROUND_TASKS.add(
        await expire.remove_expired_keys(
            _SETTINGS.openrouter_base_url,
            _SETTINGS.openrouter_prov_api_key.get_secret_value(),
            _CLIENT,
            _LOGGER,
        )
    )
    yield
    await expire.remove_all_keys(
        _SETTINGS.openrouter_base_url,
        _SETTINGS.openrouter_prov_api_key.get_secret_value(),
        _CLIENT,
        _LOGGER,
    )
    await _CLIENT.aclose()
    _BACKGROUND_TASKS.clear()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def verify_token(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    is_valid = False
    if _SETTINGS.dev_mode or request.method == "OPTIONS":
        is_valid = True
    else:
        token = request.headers.get("Authorization")
        if not token:
            raise HTTPException(status_code=401, detail="Missing token")
        token = token.removeprefix("Bearer ")
        is_valid = await cloudflare.is_token_valid(
            token, _SETTINGS.Audience.get_secret_value(), _SETTINGS.team_domain, _CLIENT
        )
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return await call_next(request)


class OpenRouterSession(BaseModel):
    key: bytes
    max_age: float


async def _get_openrouter_api_key() -> tuple[bytes | None, float | None]:
    url = f"{_SETTINGS.openrouter_base_url}keys"
    api_id = uuid.uuid4()
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"name": str(api_id), "include_byok_in_limit": True}
    response = await _CLIENT.post(url, headers=headers, json=payload)
    data = response.json()
    if "key" in data and "data" in data and "hash" in data["data"]:
        api_key = data["key"]
        encrypted_api_key = encrypt.encrypt_api_key(
            api_key, _SETTINGS.openrouter_key_salt.get_secret_value()
        )
        expire_at = await db.add_created_key(
            str(api_id), encrypted_api_key, str(data["data"]["hash"])
        )
        return encrypted_api_key, expire_at
    return None, None


@app.get("/api/v1/openrouter/session")
async def get_session_key() -> OpenRouterSession:
    api_key, expire_at = await db.get_available_key()
    if api_key is None or expire_at is None:
        api_key, expire_at = await _get_openrouter_api_key()
    if api_key is not None and expire_at is not None:
        delta = (
            datetime.datetime.fromtimestamp(expire_at, tz=datetime.UTC)
            - datetime.datetime.now(tz=datetime.UTC)
        ).total_seconds()
        max_age = math.floor(delta)
        return OpenRouterSession(key=api_key, max_age=max_age)
    raise HTTPException(500, "Failed to retrieve the API key.")


class OpenRouterExpense(BaseModel):
    usage: float
    total: float


@app.get("/api/v1/openrouter/expense")
async def get_openrouter_expense() -> OpenRouterExpense:
    url = f"{_SETTINGS.openrouter_base_url}credits"
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    try:
        response = await _CLIENT.get(url, headers=headers)
        data = response.json()
        return OpenRouterExpense(
            usage=data["data"]["total_usage"],
            total=data["data"]["total_credits"],
        )
    except Exception:
        _LOGGER.exception("Failed to retrieve the current expense from OpenRouter: ")
    raise HTTPException(500, "Failed to retrieve the current expense from OpenRouter")


if __name__ == "__main__":
    log_level = "debug" if _SETTINGS.dev_mode else "info"
    port = _SETTINGS.dev_port if _SETTINGS.dev_mode else _SETTINGS.prod_port
    uvicorn.run(
        "main:app",
        workers=2,
        port=port,
        log_level=log_level,
        reload=bool(_SETTINGS.dev_mode),
    )
