import logging
import ssl
import sys
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
from fastapi.responses import Response, StreamingResponse
from httpx import AsyncClient
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.background import BackgroundTask


class Settings(BaseSettings):
    dev_mode: int
    prod_port: int
    dev_port: int
    frontend_prod_url: str
    frontend_dev_url: str
    frontend_dev_url_2: str
    openai_api_key: SecretStr
    openai_base_url: str
    openai_admin_key: SecretStr
    openai_admin_base_url: str
    openrouter_api_key: SecretStr
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

_ORIGINS = [
    f"{_SETTINGS.frontend_prod_url}",
    f"{_SETTINGS.frontend_dev_url}",
    f"{_SETTINGS.frontend_dev_url_2}",
    f"http://localhost:{_SETTINGS.dev_port}",
    f"http://127.0.0.1:{_SETTINGS.dev_port}",
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


async def _proxy_provider(
    base_url: str, api_key: SecretStr, request: Request, p1: str, p2: str | None = None
) -> StreamingResponse:
    url = urljoin(base_url, p1)
    if p2 is not None:
        url = urljoin(f"{url}/", p2)
    if request.url.query:
        url += f"?{request.url.query}"
    _LOGGER.debug("URL: %s", url)
    body = None
    if request.method == "POST":
        body = await request.json()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("authorization", "host", "x-forwarded-for")
    }
    headers["Authorization"] = f"Bearer {api_key.get_secret_value()}"
    new_request = _CLIENT.build_request(
        request.method,
        str(url),
        headers=headers,
        json=body,
    )
    response = await _CLIENT.send(new_request, stream=True)
    return StreamingResponse(
        response.aiter_raw(),
        response.status_code,
        response.headers,
        background=BackgroundTask(response.aclose),
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


async def _validate_token(token: str, keys: list[Any]) -> bool:
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
        keys = await _get_cloudflare_keys()
        is_valid = await _validate_token(token, keys)
        if not is_valid:
            _get_cloudflare_keys.cache_clear()
            keys = await _get_cloudflare_keys()
            is_valid = await _validate_token(token, keys)
    if is_valid:
        return await call_next(request)
    raise HTTPException(status_code=403, detail="Invalid token")


@app.get("/api/v1/openrouter/{p1:path}")
@app.post("/api/v1/openrouter/{p1:path}")
async def proxy_openrouter(p1: str, request: Request) -> StreamingResponse:
    return await _proxy_provider(
        _SETTINGS.openrouter_base_url, _SETTINGS.openrouter_api_key, request, p1
    )


@app.get("/api/v1/openrouter/{p1:path}/{p2:path}")
@app.post("/api/v1/openrouter/{p1:path}/{p2:path}")
async def proxy_openrouter_2(p1: str, p2: str, request: Request) -> StreamingResponse:
    return await _proxy_provider(
        _SETTINGS.openrouter_base_url, _SETTINGS.openrouter_api_key, request, p1, p2
    )


@app.get("/api/v1/openai/organization/{p1:path}")
async def proxy_openai_admin(p1: str, request: Request) -> StreamingResponse:
    return await _proxy_provider(
        _SETTINGS.openai_admin_base_url, _SETTINGS.openai_admin_key, request, p1
    )


@app.get("/api/v1/openai/{p1:path}")
@app.post("/api/v1/openai/{p1:path}")
async def proxy_openai(p1: str, request: Request) -> StreamingResponse:
    return await _proxy_provider(
        _SETTINGS.openai_base_url, _SETTINGS.openai_api_key, request, p1
    )


@app.get("/api/v1/openai/{p1:path}/{p2:path}")
@app.post("/api/v1/openai/{p1:path}/{p2:path}")
async def proxy_openai_2(p1: str, p2: str, request: Request) -> StreamingResponse:
    return await _proxy_provider(
        _SETTINGS.openai_base_url, _SETTINGS.openai_api_key, request, p1, p2
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
        ssl_keyfile=Path(Path(__file__).parent, "ca", "private", "server.key"),
        ssl_certfile=Path(Path(__file__).parent, "ca", "certs", "server.crt"),
        ssl_ca_certs=str(
            Path(Path(__file__).parent, "ca", "certs", "ca.crt").resolve()
        ),
        ssl_cert_reqs=ssl.CERT_REQUIRED,
    )
