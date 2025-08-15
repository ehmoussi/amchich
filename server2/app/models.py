"""Models of the app."""

import datetime
from typing import Any, Literal

from pydantic import UUID4, UUID7, BaseModel, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from uuid_utils.compat import UUID


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


def validate_uuid(val: Any, version: Literal[1, 3, 4, 5, 6, 7, 8]) -> UUID:  # noqa: ANN401
    if not isinstance(val, UUID):
        msg = f"Expected a UUID, got {type(val)}"
        raise TypeError(msg)
    if val.version != version:
        msg = f"Expected a UUID{version}, got UUID{val.version}"
        raise ValueError(msg)
    return val


type LastEventID = UUID7
type InboxID = UUID4
type DeviceID = UUID4
type OperationType = Literal["insert", "update", "delete"]
type TableType = Literal["conversation", "message", "streaming", "models"]


class Inbox(BaseModel):
    id: InboxID
    device_id: DeviceID = Field(alias="deviceId")
    created_at: str = Field(alias="createdAt")
    op: OperationType
    table: TableType
    payload: Any


class LastEvent(BaseModel):
    last_event_id: LastEventID | None = Field(alias="lastEventId")
