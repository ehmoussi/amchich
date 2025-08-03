import asyncio
import logging
import sys
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from httpx import AsyncClient
from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app import cloudflare, db, encrypt, expire


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


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    await db.create_db_and_tables()
    await expire.remove_all_keys(
        _SETTINGS.openrouter_base_url,
        _SETTINGS.openrouter_prov_api_key.get_secret_value(),
        _CLIENT,
        _LOGGER,
    )
    try:
        yield
    finally:
        try:
            _LOGGER.info("Remove all the keys in the database")
            await expire.remove_all_keys(
                _SETTINGS.openrouter_base_url,
                _SETTINGS.openrouter_prov_api_key.get_secret_value(),
                _CLIENT,
                _LOGGER,
            )
        finally:
            await _CLIENT.aclose()


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


class OpenRouterSessionResponseData(BaseModel):
    name: str
    label: str
    limit: float | None
    disabled: bool
    created_at: str
    updated_at: str | None
    hash: str


class OpenRouterSessionResponse(BaseModel):
    key: SecretStr
    data: OpenRouterSessionResponseData


async def _get_openrouter_api_key() -> tuple[bytes | None, str | None, float | None]:
    url = f"{_SETTINGS.openrouter_base_url}keys"
    api_id = str(uuid.uuid4())
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"name": api_id, "include_byok_in_limit": True}
    try:
        response = await _CLIENT.post(url, headers=headers, json=payload)
        response_json = response.json()
        data = OpenRouterSessionResponse(**response_json)
        api_hash = data.data.hash
        encrypted_api_key = encrypt.encrypt_api_key(
            data.key.get_secret_value(),
            _SETTINGS.openrouter_key_salt.get_secret_value(),
        )
        expire_at = await db.add_created_key(api_id, encrypted_api_key, api_hash)
    except Exception:
        _LOGGER.exception("Failed to create the API key")
        return None, None, None
    else:
        return encrypted_api_key, api_hash, expire_at


async def remove_session_key(api_hash: str, delay: int) -> None:
    """Remove the session api key after the given delay in seconds"""
    await asyncio.sleep(delay)
    await expire.remove_key(
        api_hash,
        _SETTINGS.openrouter_base_url,
        _SETTINGS.openrouter_prov_api_key.get_secret_value(),
        _CLIENT,
        _LOGGER,
    )


@app.get("/api/v1/openrouter/session")
async def get_session_key(background_tasks: BackgroundTasks) -> OpenRouterSession:
    api_hash: str | None = None
    api_key, expire_at = await db.get_available_key()
    max_age = expire.compute_max_age_session(api_key, expire_at)
    if api_key is None or max_age is None:
        api_key, api_hash, expire_at = await _get_openrouter_api_key()
        max_age = expire.compute_max_age_session(api_key, expire_at)
    if api_key is None or max_age is None:
        raise HTTPException(500, "Failed to retrieve the API key.")
    if api_hash is not None:
        background_tasks.add_task(remove_session_key, api_hash, max_age)
    return OpenRouterSession(key=api_key, max_age=max_age)


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
    do_reload = bool(_SETTINGS.dev_mode)
    port = _SETTINGS.dev_port if _SETTINGS.dev_mode else _SETTINGS.prod_port
    uvicorn.run(
        "app.main:app", workers=2, port=port, log_level=log_level, reload=do_reload
    )
