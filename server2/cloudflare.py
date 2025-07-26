"""Cloudflare token validation tools."""

from typing import Any

import async_lru
import httpx
import jwt
from fastapi import HTTPException


async def is_token_valid(
    token: str, audience: str, team_domain: str, client: httpx.AsyncClient
) -> bool:
    keys = await get_cloudflare_keys(client, team_domain)
    is_valid = await can_decode_token(token, keys, audience)
    if not is_valid:
        get_cloudflare_keys.cache_clear()
        keys = await get_cloudflare_keys()
        is_valid = await can_decode_token(token, keys, audience)
    return is_valid


@async_lru.alru_cache
async def get_cloudflare_keys(client: httpx.AsyncClient, team_domain: str) -> list[Any]:
    response = await client.get(
        f"https://{team_domain}.cloudflareaccess.com/cdn-cgi/access/certs"
    )
    body = response.json()
    if "keys" not in body:
        raise HTTPException(
            status_code=500, detail="Token validation failed unexpectedly"
        )
    return body["keys"]


async def can_decode_token(token: str, keys: list[Any], audience: str) -> bool:
    for jwt_key in keys:
        try:
            jwt.decode(
                token,
                key=jwt.get_algorithm_by_name("RS256").from_jwk(jwt_key),
                audience=audience,
                algorithms=["RS256"],
            )
        except jwt.PyJWTError:
            pass
        else:
            return True
    return False
