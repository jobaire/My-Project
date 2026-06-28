import secrets
from datetime import datetime, timedelta, timezone
from hmac import compare_digest

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
)

REFRESH_TOKEN_EXPIRE_DAYS = 30

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False

    if hashed_password.startswith("$2"):
        return password_context.verify(plain_password, hashed_password)

    # Temporary fallback for legacy plaintext records while the app is being hardened.
    return compare_digest(plain_password, hashed_password)


def create_access_token(
    subject: str,
    tenant_id: int | None,
    role: str | None = None,
    email: str | None = None,
    roles: list[str] | None = None,
    perms: dict[str, str] | None = None,
    sub_tenant_ids: list[int] | None = None,
    sub_tenant_all: bool = False,
    plan: str | None = None,
    trial_ends_at: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "email": email,
        "tenant_id": tenant_id,
        "role": role,
        "roles": roles or [],
        "perms": perms or {},
        "sub_tenant_ids": sub_tenant_ids or [],
        "sub_tenant_all": sub_tenant_all,
        "plan": plan or "trial",
        "trial_ends_at": trial_ends_at,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(db: Session, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.execute(
        text("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (:uid, :tok, :exp)"),
        {"uid": user_id, "tok": token, "exp": expires_at},
    )
    return token


def consume_refresh_token(db: Session, token: str) -> int:
    """Validate refresh token and return user_id. Raises HTTPException if invalid."""
    row = db.execute(
        text("SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token = :tok"),
        {"tok": token},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if row["revoked_at"] is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")

    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Rotate: revoke old token, caller will issue a new one
    db.execute(
        text("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = :id"),
        {"id": row["id"]},
    )
    return int(row["user_id"])


def revoke_refresh_token(db: Session, token: str) -> None:
    db.execute(
        text("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = :tok"),
        {"tok": token},
    )


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    if "sub" not in payload or "tenant_id" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing required claims",
        )

    return payload
