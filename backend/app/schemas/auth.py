import re
from pydantic import BaseModel, EmailStr, Field, field_validator


def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError('Password must be at least 8 characters.')
    if not re.search(r'[A-Z]', v):
        raise ValueError('Password must contain at least one uppercase letter.')
    if not re.search(r'[0-9]', v):
        raise ValueError('Password must contain at least one number.')
    if not re.search(r'[^A-Za-z0-9]', v):
        raise ValueError('Password must contain at least one special character (!@#$%^&* etc).')
    return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user_id: int | None = None
    tenant_id: int | None = None
    tenant_name: str | None = None
    role: str | None = None           # backward compat — primary role
    roles: list[str] = []
    perms: dict[str, str] = {}        # e.g. {"orders": "rw", "products": "r"}
    sub_tenant_ids: list[int] = []
    sub_tenant_all: bool = False
    email: str | None = None
    full_name: str | None = None
    department: str | None = None
    designation: str | None = None
    avatar: str | None = None
    refresh_token: str | None = None
    trial_ends_at: str | None = None   # ISO datetime, only set for trial companies


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class SetPasswordRequest(BaseModel):
    token: str
    purpose: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator('new_password')
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password_strength(v)
