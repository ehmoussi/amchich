"""Encrypt the API key."""

import json
import os
from base64 import b64encode

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def encrypt_api_key(api_key: str, password: str) -> bytes:
    # Generate 16-byte salt & 12-byte IV per NIST SP 800-38D
    salt = os.urandom(16)
    iv = os.urandom(12)

    # Derive 256-bit key with 600000 iterations (OWASP recommendation)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
    )
    key = kdf.derive(password.encode())

    # Encrypt under AES-GCM
    encryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(iv),
    ).encryptor()
    ciphertext = encryptor.update(api_key.encode()) + encryptor.finalize()
    tag = encryptor.tag
    # Package as JSON (Base64-encoded)
    payload = {
        "salt": b64encode(salt).decode(),
        "iv": b64encode(iv).decode(),
        "ciphertext": b64encode(ciphertext).decode(),
        "tag": b64encode(tag).decode(),
    }
    return b64encode(json.dumps(payload).encode())
