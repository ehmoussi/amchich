"""Database Store."""

import datetime
import json

import aiosqlite
from pydantic import UUID7
from uuid_utils.compat import uuid7

from app.models import Inbox

DB_PATH = "./db.sqlite"
EXPIRATION_MINUTES_LIMIT = 15


async def create_db_and_tables() -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            """--sql
            CREATE TABLE IF NOT EXISTS openrouter_key(
                api_id TEXT PRIMARY KEY NOT NULL,
                api_key BLOB NOT NULL,
                api_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                expire_at REAL NOT NULL
            )
            """
        )
        await conn.execute(
            """--sql
            CREATE TABLE IF NOT EXISTS inbox_events(
                event_id TEXT PRIMARY KEY NOT NULL,
                client_event_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                op TEXT NOT NULL,
                table_type TEXT NOT NULL,
                payload BLOB NOT NULL
            )
            """
        )
        await conn.commit()


async def get_available_key(
    offset: float = 120,
) -> tuple[bytes | None, str | None, float | None]:
    current_date = datetime.datetime.now(tz=datetime.UTC).timestamp() + offset
    async with aiosqlite.connect(DB_PATH) as conn:
        cursor = await conn.execute(
            """--sql
            SELECT api_key, api_hash, expire_at
            FROM openrouter_key
            WHERE expire_at > :current_date
            LIMIT 1
            """,
            {"current_date": current_date},
        )
        row = await cursor.fetchone()
        if row is not None:
            return bytes(row[0]), str(row[1]), float(row[2])
    return None, None, None


async def get_expired_keys() -> list[str]:
    async with (
        aiosqlite.connect(DB_PATH) as conn,
        conn.execute(
            """--sql
            SELECT api_hash
            FROM openrouter_key
            WHERE expire_at <= :current_date
            """,
            {"current_date": datetime.datetime.now(tz=datetime.UTC).timestamp()},
        ) as cursor,
    ):
        return [str(api_hash) async for api_hash, *_ in cursor]
    return []


async def get_all_keys() -> list[str]:
    """Get the api hash of all the keys stored in the database."""
    async with (
        aiosqlite.connect(DB_PATH) as conn,
        conn.execute(
            """--sql
        SELECT api_hash
        FROM openrouter_key
        """
        ) as cursor,
    ):
        return [str(api_hash) async for api_hash, *_ in cursor]
    return []


async def add_created_key(api_id: str, api_key: bytes, api_hash: str) -> float:
    created_at = datetime.datetime.now(tz=datetime.UTC).timestamp()
    expire_at = (
        datetime.datetime.now(tz=datetime.UTC)
        + datetime.timedelta(minutes=EXPIRATION_MINUTES_LIMIT)
    ).timestamp()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            """--sql
            INSERT INTO openrouter_key(api_id, api_key, api_hash, created_at, expire_at)
            VALUES(:api_id, :api_key, :api_hash, :created_at, :expire_at)
            """,
            {
                "api_id": api_id,
                "api_key": api_key,
                "api_hash": api_hash,
                "created_at": created_at,
                "expire_at": expire_at,
            },
        )
        await conn.commit()
        return expire_at


async def delete_key(api_hash: str) -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            """--sql
            DELETE FROM openrouter_key
            WHERE api_hash = :api_hash
            """,
            {"api_hash": api_hash},
        )
        await conn.commit()


async def get_current_keys() -> list[tuple[str, datetime.datetime]]:
    async with (
        aiosqlite.connect(DB_PATH) as conn,
        conn.execute(
            """--sql
        SELECT api_hash, expire_at
        FROM openrouter_key
        """
        ) as cursor,
    ):
        return [
            (
                str(api_hash),
                datetime.datetime.fromtimestamp(float(expire_at), tz=datetime.UTC),
            )
            async for api_hash, expire_at in cursor
        ]
    return []


async def add_events(events: list[Inbox]) -> UUID7 | None:
    event_id = None
    async with aiosqlite.connect(DB_PATH) as conn:
        for event in events:
            event_id = uuid7()
            await conn.execute(
                """--sql
                INSERT INTO inbox_events(
                    event_id,
                    client_event_id,
                    device_id,
                    created_at,
                    op,
                    table_type,
                    payload
                )
                VALUES(
                    :event_id,
                    :client_event_id,
                    :device_id,
                    :created_at,
                    :op,
                    :table_type,
                    :payload
                )
                """,
                {
                    "event_id": str(event_id),
                    "client_event_id": str(event.id),
                    "device_id": str(event.device_id),
                    "created_at": datetime.datetime.fromisoformat(
                        event.created_at
                    ).timestamp(),
                    "op": event.op,
                    "table_type": event.table,
                    "payload": json.dumps(event.payload),
                },
            )
        await conn.commit()
    return event_id
