"""Authentication service: password hashing, JWT tokens, user CRUD in encrypted JSON."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.services.encryption import decrypt, encrypt

USERS_PATH = Path(__file__).resolve().parents[1] / "storage" / "users.enc"

# JWT config — HS256 with a local secret
_JWT_SECRET_PATH = Path(__file__).resolve().parents[1] / "storage" / ".jwt_secret"
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_HOURS = 72


def _get_jwt_secret() -> str:
    _JWT_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _JWT_SECRET_PATH.exists():
        return _JWT_SECRET_PATH.read_text(encoding="utf-8").strip()
    secret = uuid.uuid4().hex + uuid.uuid4().hex  # 64-char random
    _JWT_SECRET_PATH.write_text(secret, encoding="utf-8")
    return secret


# ── Password helpers ──────────────────────────────────────────


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ───────────────────────────────────────────────


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=[_JWT_ALGORITHM])
    except JWTError:
        return None


# ── User storage (encrypted JSON) ────────────────────────────


def _load_users() -> list[dict]:
    if not USERS_PATH.exists():
        return []
    raw = decrypt(USERS_PATH.read_bytes())
    return json.loads(raw.decode("utf-8"))


def _save_users(users: list[dict]) -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(users, indent=2).encode("utf-8")
    USERS_PATH.write_bytes(encrypt(raw))


def find_user_by_email(email: str) -> Optional[dict]:
    for u in _load_users():
        if u["email"].lower() == email.lower():
            return u
    return None


def find_user_by_id(user_id: str) -> Optional[dict]:
    for u in _load_users():
        if u["id"] == user_id:
            return u
    return None


def create_user(email: str, password: str) -> dict:
    users = _load_users()
    user = {
        "id": uuid.uuid4().hex,
        "email": email.lower().strip(),
        "password_hash": hash_password(password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    users.append(user)
    _save_users(users)
    return user
