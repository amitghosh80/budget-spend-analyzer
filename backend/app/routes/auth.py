"""Auth routes: register, login, me."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from app.models import AuthResponse, LoginRequest, RegisterRequest, UserInfo
from app.services.auth import (
    create_token,
    create_user,
    decode_token,
    find_user_by_email,
    find_user_by_id,
    verify_password,
)

router = APIRouter()


def _get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Decode JWT from Authorization header. Returns user dict or None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    payload = decode_token(token)
    if not payload:
        return None
    return find_user_by_id(payload["sub"])


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest):
    if find_user_by_email(body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = create_user(body.email, body.password)
    token = create_token(user["id"], user["email"])
    return AuthResponse(token=token, user=UserInfo(id=user["id"], email=user["email"]))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    user = find_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["email"])
    return AuthResponse(token=token, user=UserInfo(id=user["id"], email=user["email"]))


@router.get("/me", response_model=UserInfo)
def me(authorization: Optional[str] = Header(None)):
    user = _get_optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserInfo(id=user["id"], email=user["email"])
