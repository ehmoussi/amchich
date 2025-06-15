import logging
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from urllib.parse import urljoin

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from httpx import AsyncClient
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.background import BackgroundTask


class Settings(BaseSettings):
    dev_mode: int
    dev_port: int
    frontend_dev_url: str
    frontend_dev_url_2: str
    openai_api_key: SecretStr
    openai_base_url: str
    openai_admin_key: SecretStr
    openai_admin_base_url: str
    openrouter_api_key: SecretStr
    openrouter_base_url: str

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


_SETTINGS = Settings()

_LOGGER = logging.getLogger("amchich")
_LOGGER.addHandler(logging.StreamHandler(sys.stdout))

if _SETTINGS.dev_mode:
    _LOGGER.setLevel(logging.DEBUG)
else:
    _LOGGER.setLevel(logging.INFO)

_ORIGINS = [
    f"{_SETTINGS.frontend_dev_url}",
    f"{_SETTINGS.frontend_dev_url_2}",
    f"http://localhost:{_SETTINGS.dev_port}",
    f"http://127.0.0.1:{_SETTINGS.dev_port}",
]
_CLIENT = AsyncClient()


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
    uvicorn.run("main:app", port=_SETTINGS.dev_port, log_level=log_level, reload=True)
