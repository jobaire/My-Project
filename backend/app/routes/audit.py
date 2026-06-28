from datetime import datetime
from typing import Any, Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter()


class AuditEntry(BaseModel):
    id: int
    table_name: str
    record_id: Optional[int] = None
    action: str
    actor_email: Optional[str] = None
    changed_at: datetime
    old_data: Optional[Any] = None
    new_data: Optional[Any] = None


@router.get("/product/{product_id}", response_model=list[AuditEntry])
def get_product_audit_log(product_id: int, request: Request):
    """All audit entries for a product: the product itself, its versions, steps, and color-sizes."""
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT id, table_name, record_id, action, actor_email, changed_at, old_data, new_data
            FROM audit_log
            WHERE
                (table_name = 'products' AND record_id = :pid)
                OR (table_name = 'product_color_sizes' AND record_id = :pid)
                OR (table_name = 'style_versions' AND record_id IN (
                    SELECT id FROM style_versions WHERE product_id = :pid
                ))
                OR (table_name = 'style_version_steps' AND record_id IN (
                    SELECT svs.id FROM style_version_steps svs
                    JOIN style_versions sv ON sv.id = svs.version_id
                    WHERE sv.product_id = :pid
                ))
            ORDER BY changed_at DESC
        """),
        {"pid": product_id},
    ).mappings().all()
    return [AuditEntry(**r) for r in rows]


@router.get("/customer/{customer_id}", response_model=list[AuditEntry])
def get_customer_audit_log(customer_id: int, request: Request):
    """All audit entries for a customer: the customer itself and its brands."""
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT id, table_name, record_id, action, actor_email, changed_at, old_data, new_data
            FROM audit_log
            WHERE
                (table_name = 'customers' AND record_id = :cid)
                OR (table_name = 'brands' AND record_id IN (
                    SELECT id FROM brands WHERE customer_id = :cid
                ))
            ORDER BY changed_at DESC
        """),
        {"cid": customer_id},
    ).mappings().all()
    return [AuditEntry(**r) for r in rows]


@router.get("/order/{order_id}", response_model=list[AuditEntry])
def get_order_audit_log(order_id: int, request: Request):
    """All audit entries for an order: the order header and all its lines."""
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT id, table_name, record_id, action, actor_email, changed_at, old_data, new_data
            FROM audit_log
            WHERE
                (table_name = 'orders' AND record_id = :oid)
                OR (table_name = 'order_lines' AND record_id IN (
                    SELECT id FROM order_lines WHERE order_id = :oid
                ))
            ORDER BY changed_at DESC
        """),
        {"oid": order_id},
    ).mappings().all()
    return [AuditEntry(**r) for r in rows]


@router.get("/{table_name}/{record_id}", response_model=list[AuditEntry])
def get_record_audit_log(table_name: str, record_id: int, request: Request):
    rows = request.state.db.execute(
        text("""
            SELECT id, table_name, record_id, action, actor_email, changed_at, old_data, new_data
            FROM audit_log
            WHERE table_name = :table AND record_id = :rid
            ORDER BY changed_at DESC
        """),
        {"table": table_name, "rid": record_id},
    ).mappings().all()
    return [AuditEntry(**r) for r in rows]
