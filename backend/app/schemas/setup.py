from typing import Optional
from pydantic import BaseModel, Field


class ProcessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    short_name: Optional[str] = Field(default=None, max_length=50)
    external_reference: Optional[str] = Field(default=None, max_length=100)
    sequence: int = Field(default=0, ge=0)
    work_content_unit: Optional[str] = Field(default=None, max_length=50)
    planned: bool = False
    update_by_size: bool = False


class ProcessUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    external_reference: Optional[str] = None
    sequence: Optional[int] = Field(default=None, ge=0)
    work_content_unit: Optional[str] = None
    planned: Optional[bool] = None
    update_by_size: Optional[bool] = None


class ProcessResponse(BaseModel):
    id: int
    name: str
    short_name: Optional[str] = None
    external_reference: Optional[str] = None
    sequence: int = 0
    work_content_unit: Optional[str] = None
    planned: bool = False
    update_by_size: bool = False


# ── Style Categories ───────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class CategoryResponse(BaseModel):
    id: int
    name: str


class SubCategoryCreate(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)


class SubCategoryResponse(BaseModel):
    id: int
    category_id: int
    name: str


# ── Colors ─────────────────────────────────────────────────────────────────────

class ColorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ColorResponse(BaseModel):
    id: int
    name: str


# ── Sizes ──────────────────────────────────────────────────────────────────────

class SizeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    sequence: int = Field(default=0, ge=0)


class SizeResponse(BaseModel):
    id: int
    name: str
    sequence: int = 0


# ── Size Sets ──────────────────────────────────────────────────────────────────

class SizeSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    size_ids: list[int] = []


class SizeSetResponse(BaseModel):
    id: int
    name: str
    sizes: list[SizeResponse] = []


# ── Update schemas ──────────────────────────────────────────────────────────────

class NameUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class SizeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    sequence: Optional[int] = Field(default=None, ge=0)


class SizeSetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    size_ids: Optional[list[int]] = None


# ── Seasons ────────────────────────────────────────────────────────────────────

class SeasonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    year: Optional[int] = None


class SeasonUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    year: Optional[int] = None


class SeasonResponse(BaseModel):
    id: int
    name: str
    year: Optional[int] = None


# ── Units of Measure ───────────────────────────────────────────────────────────

class UoMCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    abbreviation: Optional[str] = Field(default=None, max_length=20)


class UoMUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    abbreviation: Optional[str] = None


class UoMResponse(BaseModel):
    id: int
    name: str
    abbreviation: Optional[str] = None


# ── Sub-Companies ──────────────────────────────────────────────────────────────

class SubTenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: Optional[str] = Field(default=None, max_length=50)
    is_active: bool = True


class SubTenantUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    code: Optional[str] = None
    is_active: Optional[bool] = None


class SubTenantResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    code: Optional[str] = None
    is_active: bool = True


# ── Company Roles ──────────────────────────────────────────────────────────────

class CompanyRoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    label: str = Field(min_length=1, max_length=100)


class CompanyRoleUpdate(BaseModel):
    label: str = Field(min_length=1, max_length=100)


class CompanyRoleResponse(BaseModel):
    id: int
    name: str
    label: str
    is_system: bool


# ── Module Permissions ─────────────────────────────────────────────────────────

class ModulePermissionRow(BaseModel):
    role: str
    module: str
    can_read: bool = False
    can_write: bool = False
    can_delete: bool = False


class ModulePermissionUpdate(BaseModel):
    can_read: bool = False
    can_write: bool = False
    can_delete: bool = False
