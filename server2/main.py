import base64
import logging
import ssl
import sys
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import async_lru
import jwt
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from httpx import AsyncClient
from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.background import BackgroundTask


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

_ORIGINS: list[str]
if _SETTINGS.dev_mode:
    _ORIGINS = [
        f"{_SETTINGS.frontend_dev_url}",
        f"{_SETTINGS.frontend_dev_url_2}",
        f"http://localhost:{_SETTINGS.dev_port}",
        f"http://127.0.0.1:{_SETTINGS.dev_port}",
    ]
else:
    _ORIGINS = [
        f"{_SETTINGS.frontend_prod_url}",
        f"http://localhost:{_SETTINGS.prod_port}",
        f"http://127.0.0.1:{_SETTINGS.prod_port}",
    ]

_CLIENT = AsyncClient(timeout=20)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    yield
    await _CLIENT.aclose()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@async_lru.alru_cache
async def _get_cloudflare_keys() -> list[Any]:
    response = await _CLIENT.get(
        f"https://{_SETTINGS.team_domain}.cloudflareaccess.com/cdn-cgi/access/certs"
    )
    body = response.json()
    if "keys" not in body:
        raise HTTPException(
            status_code=500, detail="Token validation failed unexpectedly"
        )
    return body["keys"]


async def _can_decode_token(token: str, keys: list[Any]) -> bool:
    for jwt_key in keys:
        try:
            jwt.decode(
                token,
                key=jwt.get_algorithm_by_name("RS256").from_jwk(jwt_key),
                audience=_SETTINGS.Audience.get_secret_value(),
                algorithms=["RS256"],
            )
        except jwt.PyJWTError:
            pass
        else:
            return True
    return False


async def _is_token_valid(token: str) -> bool:
    keys = await _get_cloudflare_keys()
    is_valid = await _can_decode_token(token, keys)
    if not is_valid:
        _get_cloudflare_keys.cache_clear()
        keys = await _get_cloudflare_keys()
        is_valid = await _can_decode_token(token, keys)
    return is_valid


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
            raise HTTPException(status_code=403, detail="Missing token")
        token = token.removeprefix("Bearer ")
        is_valid = await _is_token_valid(token)
    if not is_valid:
        raise HTTPException(status_code=403, detail="Invalid token")
    return await call_next(request)


class OpenRouterSession(BaseModel):
    key: bytes


@async_lru.alru_cache(ttl=21600)
async def _get_openrouter_api_key() -> bytes | None:
    url = f"{_SETTINGS.openrouter_base_url}keys"
    api_id = uuid.uuid4()
    headers = {
        "Authorization": f"Bearer {_SETTINGS.openrouter_prov_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"name": str(api_id), "include_byok_in_limit": True}
    response = await _CLIENT.post(url, headers=headers, json=payload)
    data = response.json()
    if "key" in data:
        api_key = data["key"]
        salted_api_key = _SETTINGS.openrouter_key_salt.get_secret_value() + api_key
        return base64.b64encode(salted_api_key.encode())
    return None


@app.get("/api/v1/openrouter/session")
async def get_session_key() -> OpenRouterSession:
    api_key = await _get_openrouter_api_key()
    if api_key is not None:
        return OpenRouterSession(key=api_key)
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
    response = await _CLIENT.get(url, headers=headers)
    data = response.json()
    return OpenRouterExpense(
        usage=data["data"]["total_usage"],
        total=data["data"]["total_credits"],
    )


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
