from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    customer_group: str | None = Field(None, max_length=255)
    description: str | None = None
    delivery_location: str | None = Field(None, max_length=255)
    plan_colour: str | None = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    late_tolerance: int = Field(0, ge=0)


class CustomerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    customer_group: str | None = None
    description: str | None = None
    delivery_location: str | None = None
    plan_colour: str | None = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    late_tolerance: int | None = Field(None, ge=0)


class CustomerResponse(BaseModel):
    id: int
    name: str
    customer_group: str | None = None
    description: str | None = None
    delivery_location: str | None = None
    plan_colour: str | None = None
    late_tolerance: int = 0


class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class BrandResponse(BaseModel):
    id: int
    customer_id: int
    name: str
    description: str | None = None
