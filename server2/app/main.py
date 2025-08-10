import asyncio
import datetime
import logging
import sys
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from httpx import AsyncClient

from app import db, encrypt, expire, tokenutils
from app.models import (
    OpenRouterExpense,
    OpenRouterSession,
    OpenRouterSessionResponse,
    Settings,
    Token,
)

_SETTINGS = Settings()  # pyright: ignore[reportCallIssue]

_LOGGER = logging.getLogger("amchich")
_LOGGER.addHandler(logging.StreamHandler(sys.stdout))

if _SETTINGS.dev_mode:
    _LOGGER.setLevel(logging.DEBUG)
else:
    _LOGGER.setLevel(logging.INFO)


client: AsyncClient | None = None


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    global client  # noqa: PLW0603
    client = AsyncClient(timeout=20)
    await db.create_db_and_tables()
    await expire.remove_all_keys(
        _SETTINGS.openrouter_base_url,
        _SETTINGS.openrouter_prov_api_key.get_secret_value(),
        client,
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
                client,
                _LOGGER,
            )
        finally:
            await client.aclose()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_SETTINGS.frontend_urls,
    allow_credentials=False,
    allow_methods=["GET", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def verify_token(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    is_valid = False
    if (
        request.url.path in ("/api/v1/health", "/favicon.ico") and request.method == "GET"
    ) or request.method == "OPTIONS":
        is_valid = True
    elif request.url.path == "/api/v1/refresh":
        if _SETTINGS.dev_mode:
            is_valid = True
        else:
            try:
                is_valid = await tokenutils.check_cloudflare_token(
                    request, client, _SETTINGS, _LOGGER
                )
            except ValueError as e:
                raise HTTPException(status_code=401, detail=str(e)) from None
    else:
        try:
            is_valid = tokenutils.check_token(request, _SETTINGS)
        except ValueError as e:
            raise HTTPException(status_code=401, detail=str(e)) from None
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return await call_next(request)


@app.get("/api/v1/health")
def check_health() -> str:
    return "Hello"


@app.get("/api/v1/refresh")
async def get_token(request: Request) -> Token:
    if request.client is None:
        raise HTTPException(status_code=401, detail="Missing client information")
    token = tokenutils.create_token(
        datetime.timedelta(hours=_SETTINGS.token_delay_hours),
        _SETTINGS,
    )
    return Token(token=token)


async def _get_openrouter_api_key() -> tuple[bytes | None, str | None, float | None]:
    url = f"{_SETTINGS.openrouter_base_url}/keys"
    api_id = str(uuid.uuid4())
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"name": api_id, "include_byok_in_limit": True}
    if client is None:
        _LOGGER.error("The httpx client is not available. Can't get the api key.")
        raise HTTPException(status_code=500, detail="Can't get the api key")
    try:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        response_json = response.json()
    except (httpx.HTTPStatusError, httpx.RequestError):
        _LOGGER.exception("OpenRouter request failed")
        return None, None, None
    try:
        data = OpenRouterSessionResponse(**response_json)
        api_hash = data.data.hash
        encrypted_api_key = encrypt.encrypt_api_key(
            data.key.get_secret_value(),
            _SETTINGS.openrouter_key_salt.get_secret_value(),
        )
        expire_at = await db.add_created_key(api_id, encrypted_api_key, api_hash)
    except Exception:
        if "error" in response_json:
            _LOGGER.exception(response_json["error"])
        _LOGGER.exception("Failed to create the API key")
        return None, None, None
    else:
        return encrypted_api_key, api_hash, expire_at


async def remove_session_key(api_hash: str, delay: int) -> None:
    """Remove the session api key after the given delay in seconds"""
    await asyncio.sleep(delay)
    if client is None:
        _LOGGER.error("The httpx client is not available. Can't remove the api key.")
    else:
        await expire.remove_key(
            api_hash,
            _SETTINGS.openrouter_base_url,
            _SETTINGS.openrouter_prov_api_key.get_secret_value(),
            client,
            _LOGGER,
        )


@app.get("/api/v1/openrouter/session")
async def get_session_key(background_tasks: BackgroundTasks) -> OpenRouterSession:
    is_new_key = False
    api_key, api_hash, expire_at = await db.get_available_key()
    delay_session = expire.compute_max_age_session(api_key, expire_at)
    if api_key is None or delay_session is None:
        is_new_key = True
        api_key, api_hash, expire_at = await _get_openrouter_api_key()
        delay_session = expire.compute_max_age_session(api_key, expire_at)
    if api_key is None or api_hash is None or delay_session is None:
        raise HTTPException(500, "Failed to retrieve the API key.")
    if is_new_key:
        background_tasks.add_task(remove_session_key, api_hash, delay_session.expire)
    return OpenRouterSession(key=api_key, hash=api_hash, max_age=delay_session.max_age)


@app.delete("/api/v1/openrouter/session/{api_hash}", status_code=204)
async def delete_session_key(api_hash: str) -> None:
    if client is None:
        _LOGGER.error("The httpx client is not available. Can't delete the api key.")
        raise HTTPException(status_code=500, detail="Can't delete the api key")
    try:
        await expire.remove_key(
            api_hash,
            _SETTINGS.openrouter_base_url,
            _SETTINGS.openrouter_prov_api_key.get_secret_value(),
            client,
            _LOGGER,
        )
    except Exception:
        _LOGGER.exception("Failed to remove the key: %s", api_hash)


@app.get("/api/v1/openrouter/expense")
async def get_openrouter_expense() -> OpenRouterExpense:
    url = f"{_SETTINGS.openrouter_base_url}/credits"
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    if client is None:
        _LOGGER.error("The httpx client is not available. Can't get the expense.")
        raise HTTPException(status_code=500, detail="Can't get the expense")
    try:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
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
    uvicorn.run(
        "app.main:app",
        workers=2,
        port=_SETTINGS.port,
        log_level=log_level,
        reload=_SETTINGS.dev_mode,
    )
