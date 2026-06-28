from pydantic import BaseModel, EmailStr, Field, field_validator
from app.schemas.auth import validate_password_strength

COMPANY_ROLES = {"admin", "planner", "production_manager", "data_entry", "viewer"}
ROLE_PRIORITY = ["admin", "production_manager", "planner", "data_entry", "viewer"]


def primary_role(roles: list[str]) -> str | None:
    for r in ROLE_PRIORITY:
        if r in roles:
            return r
    return roles[0] if roles else None


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str | None = Field(None, min_length=8, max_length=72)
    full_name: str | None = Field(None, max_length=255)
    roles: list[str] = Field(default=["data_entry"])
    department: str | None = Field(None, max_length=255)
    designation: str | None = Field(None, max_length=255)
    sub_tenant_ids: list[int] = []
    tenant_id: int | None = None


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    roles: list[str] | None = None
    department: str | None = Field(None, max_length=255)
    designation: str | None = Field(None, max_length=255)
    avatar: str | None = None
    sub_tenant_ids: list[int] | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    role: str | None = None          # backward compat — primary role
    roles: list[str] = []
    sub_tenant_ids: list[int] = []
    department: str | None = None
    designation: str | None = None
    avatar: str | None = None
    tenant_id: int | None = None
    is_activated: bool = True


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator('new_password')
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password_strength(v)
