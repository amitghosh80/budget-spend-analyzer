"""Tests for AES-256-GCM encryption module."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.encryption import encrypt, decrypt, _get_or_create_key, KEY_PATH


class TestEncryptDecrypt:
    def test_roundtrip(self):
        plaintext = b"Hello, this is a test PDF content" * 100
        encrypted = encrypt(plaintext)
        decrypted = decrypt(encrypted)
        assert decrypted == plaintext

    def test_encrypted_differs_from_plaintext(self):
        plaintext = b"Sensitive bank statement data"
        encrypted = encrypt(plaintext)
        assert encrypted != plaintext

    def test_nonce_uniqueness(self):
        plaintext = b"Same content encrypted twice"
        enc1 = encrypt(plaintext)
        enc2 = encrypt(plaintext)
        # Different nonces → different ciphertext
        assert enc1 != enc2
        # Both decrypt to same plaintext
        assert decrypt(enc1) == plaintext
        assert decrypt(enc2) == plaintext

    def test_encrypted_longer_than_plaintext(self):
        plaintext = b"Short"
        encrypted = encrypt(plaintext)
        # 12-byte nonce + ciphertext + 16-byte GCM tag
        assert len(encrypted) == len(plaintext) + 12 + 16

    def test_tampered_ciphertext_raises(self):
        plaintext = b"Tamper test content"
        encrypted = bytearray(encrypt(plaintext))
        # Flip a byte in the ciphertext (after the 12-byte nonce)
        encrypted[20] ^= 0xFF
        with pytest.raises(Exception):
            decrypt(bytes(encrypted))

    def test_empty_plaintext(self):
        encrypted = encrypt(b"")
        assert decrypt(encrypted) == b""

    def test_large_payload(self):
        plaintext = b"\x00" * (5 * 1024 * 1024)  # 5 MB
        encrypted = encrypt(plaintext)
        assert decrypt(encrypted) == plaintext


class TestKeyManagement:
    def test_key_is_32_bytes(self):
        key = _get_or_create_key()
        assert len(key) == 32

    def test_key_persists_to_file(self):
        _get_or_create_key()
        assert KEY_PATH.exists()
        assert len(KEY_PATH.read_bytes()) == 32
