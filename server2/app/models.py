"""Models of the app."""

import datetime

from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    dev_mode: bool
    port: int
    frontend_urls: list[str]
    openrouter_prov_api_key: SecretStr
    openrouter_key_salt: SecretStr
    openrouter_base_url: str
    team_domain: str
    audience: SecretStr
    token_secret_key: SecretStr
    token_delay_hours: int

    model_config = SettingsConfigDict(
        env_file=(".env.dev", ".env.prod"), env_file_encoding="utf-8"
    )


class OpenRouterSession(BaseModel):
    key: bytes
    hash: str
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


class OpenRouterExpense(BaseModel):
    usage: float
    total: float


class TokenPayload(BaseModel):
    issued_at: datetime.datetime
    expire_at: datetime.datetime


class Token(BaseModel):
    token: bytes
