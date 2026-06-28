from pydantic import BaseModel, EmailStr, Field  # EmailStr kept for TenantUpdateRequest


class TenantCreateRequest(BaseModel):
    tenant_name: str = Field(min_length=1, max_length=255)
    database_name: str = Field(
        min_length=1,
        max_length=63,
        pattern=r"^[a-z][a-z0-9_]*$",
    )


class TenantCreateResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    database_name: str


class TenantResponse(BaseModel):
    id: int
    name: str
    contact_email: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool


class TenantUpdateRequest(BaseModel):
    tenant_name: str | None = Field(None, min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    address: str | None = Field(None, max_length=500)
    phone: str | None = Field(None, max_length=50)
