"""AES-256-GCM encryption for uploaded PDF statements."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_PATH = Path(__file__).resolve().parents[1] / "storage" / ".encryption_key"

_cached_key: bytes | None = None


def _get_or_create_key() -> bytes:
    """Load existing 256-bit key or generate a new one."""
    global _cached_key
    if _cached_key is not None:
        return _cached_key

    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)

    if KEY_PATH.exists():
        _cached_key = KEY_PATH.read_bytes()
        if len(_cached_key) != 32:
            raise ValueError("Encryption key file is corrupted (expected 32 bytes)")
    else:
        _cached_key = secrets.token_bytes(32)
        KEY_PATH.write_bytes(_cached_key)

    return _cached_key


def encrypt(plaintext: bytes) -> bytes:
    """Encrypt with AES-256-GCM. Returns nonce (12 bytes) + ciphertext."""
    key = _get_or_create_key()
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt(data: bytes) -> bytes:
    """Decrypt nonce-prefixed AES-256-GCM ciphertext."""
    key = _get_or_create_key()
    nonce = data[:12]
    ciphertext = data[12:]
    return AESGCM(key).decrypt(nonce, ciphertext, None)
