from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

ORDER_STATUSES = ['Forecast', 'Projection', 'Under Projection', 'Confirmed']


class OrderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = 'Forecast'
    customer_id: Optional[int] = None
    brand_id: Optional[int] = None
    product_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    version_id: Optional[int] = None
    customer_po: Optional[str] = Field(default=None, max_length=255)
    season_id: Optional[int] = None
    parent_order_id: Optional[int] = None


class OrderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None
    customer_id: Optional[int] = None
    brand_id: Optional[int] = None
    product_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    version_id: Optional[int] = None
    customer_po: Optional[str] = None
    season_id: Optional[int] = None
    parent_order_id: Optional[int] = None


class OrderResponse(BaseModel):
    id: int
    name: str
    status: str
    description: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    brand_id: Optional[int] = None
    brand_name: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    version_id: Optional[int] = None
    version_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    sub_category_id: Optional[int] = None
    sub_category_name: Optional[str] = None
    season_id: Optional[int] = None
    season_name: Optional[str] = None
    parent_order_id: Optional[int] = None
    parent_order_name: Optional[str] = None
    customer_po: Optional[str] = None
    line_count: int = 0
    created_at: Optional[datetime] = None


class OrderLineCreate(BaseModel):
    color_id: Optional[int] = None
    size_ids: list[int] = []
    ratio: Optional[str] = Field(default=None, max_length=100)
    delivery_qty: int = Field(default=0, ge=0)
    delivery_date: Optional[date] = None
    uom_id: Optional[int] = None
    selling_price: Optional[float] = None
    selling_cost: Optional[float] = None
    currency: str = 'USD'
    product_id: Optional[int] = None
    version_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None


class OrderLineUpdate(BaseModel):
    color_id: Optional[int] = None
    size_ids: Optional[list[int]] = None
    ratio: Optional[str] = None
    delivery_qty: Optional[int] = Field(default=None, ge=0)
    delivery_date: Optional[date] = None
    uom_id: Optional[int] = None
    selling_price: Optional[float] = None
    selling_cost: Optional[float] = None
    currency: Optional[str] = None
    product_id: Optional[int] = None
    version_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None


class OrderLineResponse(BaseModel):
    id: int
    order_id: int
    line_number: int
    color_id: Optional[int] = None
    color_name: Optional[str] = None
    size_ids: list[int] = []
    size_names: list[str] = []
    ratio: Optional[str] = None
    delivery_qty: int = 0
    delivery_date: Optional[date] = None
    uom_id: Optional[int] = None
    uom_name: Optional[str] = None
    selling_price: Optional[float] = None
    selling_cost: Optional[float] = None
    currency: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    version_id: Optional[int] = None
    version_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    sub_category_id: Optional[int] = None
    sub_category_name: Optional[str] = None
