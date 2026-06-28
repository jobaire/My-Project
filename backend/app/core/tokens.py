import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

RESET_TTL_HOURS = 1
INVITE_TTL_HOURS = 48


def _ttl(purpose: str) -> timedelta:
    return timedelta(hours=INVITE_TTL_HOURS if purpose == "invite" else RESET_TTL_HOURS)


def create_token(db: Session, user_id: int, purpose: str) -> str:
    """Invalidate any existing active tokens for this user+purpose, then create a new one."""
    db.execute(
        text("""
            UPDATE password_reset_tokens
            SET expires_at = NOW()
            WHERE user_id = :uid
              AND purpose = :purpose
              AND used_at IS NULL
              AND expires_at > NOW()
        """),
        {"uid": user_id, "purpose": purpose},
    )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + _ttl(purpose)

    db.execute(
        text("""
            INSERT INTO password_reset_tokens (user_id, token, purpose, expires_at)
            VALUES (:uid, :token, :purpose, :expires_at)
        """),
        {"uid": user_id, "token": token, "purpose": purpose, "expires_at": expires_at},
    )
    return token


def consume_token(db: Session, token: str, purpose: str) -> int:
    """
    Validate token and mark it used. Returns the user_id on success.
    Raises ValueError with a user-facing message if invalid.
    """
    row = db.execute(
        text("""
            SELECT id, user_id, expires_at, used_at
            FROM password_reset_tokens
            WHERE token = :token AND purpose = :purpose
        """),
        {"token": token, "purpose": purpose},
    ).mappings().first()

    if not row:
        raise ValueError("Invalid or expired link. Please request a new one.")

    if row["used_at"] is not None:
        raise ValueError("This link has already been used. Please request a new one.")

    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise ValueError("This link has expired. Please request a new one.")

    db.execute(
        text("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id"),
        {"id": row["id"]},
    )
    return int(row["user_id"])
