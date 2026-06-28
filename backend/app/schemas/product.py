from typing import Optional
from pydantic import BaseModel, Field


# ── Legacy routing-process schemas (used internally) ──────────────────────────

class RoutingProcessCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    default_machine_type: Optional[str] = Field(default=None, max_length=100)
    default_skill_type: Optional[str] = Field(default=None, max_length=100)
    default_smv_minutes: Optional[float] = Field(default=None, ge=0)
    is_active: bool = True


class RoutingProcessUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    default_machine_type: Optional[str] = None
    default_skill_type: Optional[str] = None
    default_smv_minutes: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class RoutingProcessResponse(RoutingProcessCreate):
    id: int


class MessageResponse(BaseModel):
    message: str


# ── Products ───────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    sku: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=255)
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    customer_id: Optional[int] = None
    brand_id: Optional[int] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    department: Optional[str] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    customer_id: Optional[int] = None
    brand_id: Optional[int] = None


class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sku: Optional[str] = None
    department: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    sub_category_id: Optional[int] = None
    sub_category_name: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    brand_id: Optional[int] = None
    brand_name: Optional[str] = None


# ── Style versions ─────────────────────────────────────────────────────────────

class StyleVersionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class StyleVersionUpdate(BaseModel):
    name: Optional[str] = None


class StyleVersionResponse(BaseModel):
    id: int
    product_id: int
    name: str


# ── Version steps ──────────────────────────────────────────────────────────────

class VersionStepCreate(BaseModel):
    process_name: str = Field(min_length=1, max_length=255)
    unit_of_measurement: Optional[str] = None
    work_content: Optional[str] = None


class VersionStepUpdate(BaseModel):
    process_name: Optional[str] = None
    unit_of_measurement: Optional[str] = None
    work_content: Optional[str] = None


class VersionStepResponse(BaseModel):
    id: int
    version_id: int
    sequence: int
    process_name: str
    unit_of_measurement: Optional[str] = None
    work_content: Optional[str] = None


# ── Color-Size matrix ──────────────────────────────────────────────────────────

class ColorSizeEntry(BaseModel):
    color_id: int
    size_ids: list[int]


class ColorSizeRow(BaseModel):
    color_id: int
    color_name: str
    size_ids: list[int]
