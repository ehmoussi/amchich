"""Manage the expiration of the API keys."""

import asyncio
import logging

import httpx

import db

_REPEAT_CHECK_EXPIRATION_EVERY_SECONDS = 10 * 60  # 10 minutes


async def remove_expired_keys(
    openrouter_base_url: str,
    openrouter_prov_api_key: str,
    client: httpx.AsyncClient,
    logger: logging.Logger,
) -> asyncio.Task[None]:
    async def loop() -> None:
        while True:
            logger.info("Try removing expired keys")
            try:
                expired_api_hashes = await db.get_expired_keys()
                logger.info("expired keys: %s", expired_api_hashes)
                tasks = [
                    remove_expired_key(
                        api_hash,
                        openrouter_base_url,
                        openrouter_prov_api_key,
                        client,
                        logger,
                    )
                    for api_hash in expired_api_hashes
                ]
                await asyncio.gather(*tasks)
            except Exception:
                logger.exception("Failed to remove the expired keys: ")
            await asyncio.sleep(_REPEAT_CHECK_EXPIRATION_EVERY_SECONDS)

    return asyncio.ensure_future(loop())


async def remove_expired_key(
    api_hash: str,
    openrouter_base_url: str,
    openrouter_prov_api_key: str,
    client: httpx.AsyncClient,
    logger: logging.Logger,
) -> bool:
    url = f"{openrouter_base_url}keys/{api_hash}"
    logger.debug(url)
    headers = {
        "Authorization": f"Bearer {openrouter_prov_api_key}",
        "Content-Type": "application/json",
    }
    response = await client.delete(url, headers=headers)
    data = response.json()
    logger.debug(data)
    if "deleted" in data and bool(data["deleted"]):
        await db.delete_key(api_hash)
        logger.info("Successfully delete api: %s", api_hash)
        return True
    if (
        "error" in data
        and "message" in data["error"]
        and data["error"]["message"] == "API key not found"
    ):
        await db.delete_key(api_hash)
        logger.info("Successfully delete api in the db: %s", api_hash)
    logger.info("Failed to delete api: %s", api_hash)
    return False
