import csv
import io
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import text

from app.schemas.order import (
    OrderCreate, OrderLineCreate, OrderLineResponse, OrderLineUpdate,
    OrderResponse, OrderUpdate,
)
from app.schemas.pagination import Page
from app.services.audit import log_change

router = APIRouter()

_ORDER_COLS = """
    o.id, o.name, o.status, o.description, o.customer_po, o.created_at,
    o.customer_id, c.name AS customer_name,
    o.brand_id, b.name AS brand_name,
    o.product_id, p.name AS product_name,
    o.version_id, sv.name AS version_name,
    o.category_id, sc.name AS category_name,
    o.sub_category_id, ssc.name AS sub_category_name,
    o.season_id, s.name AS season_name,
    o.parent_order_id, po.name AS parent_order_name,
    (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) AS line_count
"""

_ORDER_JOINS = """
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN brands b ON b.id = o.brand_id
    LEFT JOIN products p ON p.id = o.product_id
    LEFT JOIN style_versions sv ON sv.id = o.version_id
    LEFT JOIN style_categories sc ON sc.id = o.category_id
    LEFT JOIN style_sub_categories ssc ON ssc.id = o.sub_category_id
    LEFT JOIN seasons s ON s.id = o.season_id
    LEFT JOIN orders po ON po.id = o.parent_order_id
"""

_LINE_COLS = """
    ol.id, ol.order_id, ol.line_number, ol.color_id, c.name AS color_name,
    ol.ratio, ol.delivery_qty, ol.delivery_date, ol.uom_id, u.name AS uom_name,
    ol.selling_price, ol.selling_cost, ol.currency,
    ol.product_id, p2.name AS product_name,
    ol.version_id, sv2.name AS version_name,
    ol.category_id, sc2.name AS category_name,
    ol.sub_category_id, ssc2.name AS sub_category_name,
    COALESCE(array_agg(ols.size_id ORDER BY sz.sequence, sz.name) FILTER (WHERE ols.size_id IS NOT NULL), '{}') AS size_ids,
    COALESCE(array_agg(sz.name ORDER BY sz.sequence, sz.name) FILTER (WHERE sz.name IS NOT NULL), '{}') AS size_names
"""

_LINE_JOINS = """
    FROM order_lines ol
    LEFT JOIN colors c ON c.id = ol.color_id
    LEFT JOIN uom u ON u.id = ol.uom_id
    LEFT JOIN products p2 ON p2.id = ol.product_id
    LEFT JOIN style_versions sv2 ON sv2.id = ol.version_id
    LEFT JOIN style_categories sc2 ON sc2.id = ol.category_id
    LEFT JOIN style_sub_categories ssc2 ON ssc2.id = ol.sub_category_id
    LEFT JOIN order_line_sizes ols ON ols.line_id = ol.id
    LEFT JOIN sizes sz ON sz.id = ols.size_id
"""

_LINE_GROUP_BY = """
    GROUP BY ol.id, ol.order_id, ol.line_number, ol.color_id, c.name,
             ol.ratio, ol.delivery_qty, ol.delivery_date, ol.uom_id, u.name,
             ol.selling_price, ol.selling_cost, ol.currency,
             ol.product_id, p2.name, ol.version_id, sv2.name,
             ol.category_id, sc2.name, ol.sub_category_id, ssc2.name
"""


def _actor(request):
    return request.state.user.get("email") or request.state.user.get("sub")


def _sub_company_filter(request) -> tuple[str, dict]:
    """Returns WHERE fragment + params for sub-company scoping.
    Only active when user has explicit assignments. Admins bypass.
    """
    if getattr(request.state, "sub_tenant_all", False):
        return "", {}
    sc_ids = getattr(request.state, "sub_tenant_ids", [])
    if not sc_ids:
        return "", {}
    keys = [f"_sc{i}" for i in range(len(sc_ids))]
    placeholders = ", ".join(f":{k}" for k in keys)
    frag = f"(o.sub_company_id IS NULL OR o.sub_company_id IN ({placeholders}))"
    return frag, dict(zip(keys, sc_ids))


def _jsonable(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def _safe_dict(d: dict) -> dict:
    return {k: _jsonable(v) for k, v in d.items()}


def _fetch_order(db, order_id: int) -> dict | None:
    row = db.execute(
        text(f"SELECT {_ORDER_COLS} {_ORDER_JOINS} WHERE o.id = :id"),
        {"id": order_id},
    ).mappings().first()
    return _safe_dict(dict(row)) if row else None


def _fetch_order_raw(db, order_id: int) -> dict | None:
    row = db.execute(
        text("SELECT * FROM orders WHERE id = :id"), {"id": order_id}
    ).mappings().first()
    return _safe_dict(dict(row)) if row else None


def _fetch_line_data(db, line_id: int) -> dict | None:
    row = db.execute(
        text(f"SELECT {_LINE_COLS} {_LINE_JOINS} WHERE ol.id = :id {_LINE_GROUP_BY}"),
        {"id": line_id},
    ).mappings().first()
    if not row:
        return None
    return _safe_dict(dict(row))


# ── Orders ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=Page[OrderResponse])
def list_orders(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=10000),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    customer_id: Optional[int] = Query(default=None),
    season_id: Optional[int] = Query(default=None),
):
    db = request.state.db
    offset = (page - 1) * page_size
    conditions, params = [], {}
    if search:
        conditions.append("(LOWER(o.name) LIKE :q OR LOWER(o.customer_po) LIKE :q)")
        params["q"] = f"%{search.lower()}%"
    if status:
        conditions.append("o.status = :status")
        params["status"] = status
    if customer_id:
        conditions.append("o.customer_id = :customer_id")
        params["customer_id"] = customer_id
    if season_id:
        conditions.append("o.season_id = :season_id")
        params["season_id"] = season_id

    sc_frag, sc_params = _sub_company_filter(request)
    if sc_frag:
        conditions.append(sc_frag)
        params.update(sc_params)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    total = db.execute(text(f"SELECT COUNT(*) FROM orders o {where}"), params).scalar()
    rows = db.execute(
        text(f"SELECT {_ORDER_COLS} {_ORDER_JOINS} {where} ORDER BY o.created_at DESC LIMIT :lim OFFSET :off"),
        {**params, "lim": page_size, "off": offset},
    ).mappings().all()
    return Page(
        items=[OrderResponse(**_safe_dict(dict(r))) for r in rows],
        total=total, page=page, page_size=page_size,
    )


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, request: Request):
    db = request.state.db
    actor = _actor(request)
    row = db.execute(
        text("""
            INSERT INTO orders (name, description, status, customer_id, brand_id,
                                product_id, category_id, sub_category_id, version_id, customer_po,
                                season_id, parent_order_id, created_by)
            VALUES (:name, :description, :status, :customer_id, :brand_id,
                    :product_id, :category_id, :sub_category_id, :version_id, :customer_po,
                    :season_id, :parent_order_id, :created_by)
            RETURNING id
        """),
        {**payload.model_dump(), "created_by": actor},
    ).mappings().first()
    order_id = row["id"]
    log_change(db, "orders", order_id, "create", actor, new_data=_fetch_order_raw(db, order_id))
    db.commit()
    return OrderResponse(**_fetch_order(db, order_id))


@router.get("/import/template")
def order_import_template():
    lines = [
        "name,status,customer_po,description",
        "ORD-2025-001,Forecast,PO-12345,Spring collection sample order",
        "ORD-2025-002,Confirmed,,Core range reorder",
    ]
    return StreamingResponse(
        io.StringIO("\n".join(lines) + "\n"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders_template.csv"},
    )


@router.post("/import/preview")
async def preview_order_import(file: UploadFile = File(...)):
    raw = await file.read()
    csv_text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(csv_text))
    valid, errors = [], []
    for i, row in enumerate(reader, start=2):
        cleaned = {k.strip(): (v.strip() or None) for k, v in row.items()}
        try:
            payload = OrderCreate(
                name=cleaned.get("name") or "",
                status=cleaned.get("status") or "Forecast",
                customer_po=cleaned.get("customer_po"),
                description=cleaned.get("description"),
            )
            valid.append({"row": i, "data": payload.model_dump(include={"name", "status", "customer_po", "description"})})
        except ValidationError as e:
            first = e.errors()[0]
            field = str(first["loc"][0]) if first["loc"] else "field"
            errors.append({"row": i, "message": f"{field}: {first['msg']}"})
        except (ValueError, TypeError) as e:
            errors.append({"row": i, "message": str(e)})
    return {"valid": valid, "errors": errors}


@router.post("/import/confirm")
def confirm_order_import(rows: list[OrderCreate], request: Request):
    db = request.state.db
    actor = _actor(request)
    for payload in rows:
        row = db.execute(
            text("""
                INSERT INTO orders (name, description, status, customer_id, brand_id,
                                    product_id, category_id, sub_category_id, version_id, customer_po,
                                    season_id, parent_order_id, created_by)
                VALUES (:name, :description, :status, :customer_id, :brand_id,
                        :product_id, :category_id, :sub_category_id, :version_id, :customer_po,
                        :season_id, :parent_order_id, :created_by)
                RETURNING id
            """),
            {**payload.model_dump(), "created_by": actor},
        ).mappings().first()
        log_change(db, "orders", row["id"], "create", actor,
                   new_data=_fetch_order_raw(db, row["id"]))
    db.commit()
    return {"imported": len(rows)}


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, request: Request):
    row = _fetch_order(request.state.db, order_id)
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**row)


@router.patch("/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, payload: OrderUpdate, request: Request):
    db = request.state.db
    old = _fetch_order_raw(db, order_id)
    if not old:
        raise HTTPException(status_code=404, detail="Order not found")
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = order_id
    db.execute(
        text(f"UPDATE orders SET {set_clause}, updated_at = NOW() WHERE id = :id"),
        updates,
    )
    log_change(db, "orders", order_id, "update", _actor(request),
               old_data=old, new_data=_fetch_order_raw(db, order_id))
    db.commit()
    return OrderResponse(**_fetch_order(db, order_id))


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, request: Request):
    db = request.state.db
    old = _fetch_order_raw(db, order_id)
    if not old:
        raise HTTPException(status_code=404, detail="Order not found")
    db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
    log_change(db, "orders", order_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Order Lines ────────────────────────────────────────────────────────────────

@router.get("/{order_id}/lines", response_model=list[OrderLineResponse])
def list_order_lines(order_id: int, request: Request):
    db = request.state.db
    if not db.execute(text("SELECT id FROM orders WHERE id = :id"), {"id": order_id}).mappings().first():
        raise HTTPException(status_code=404, detail="Order not found")
    lines = db.execute(
        text(f"SELECT {_LINE_COLS} {_LINE_JOINS} WHERE ol.order_id = :oid {_LINE_GROUP_BY} ORDER BY ol.line_number"),
        {"oid": order_id},
    ).mappings().all()
    return [OrderLineResponse(**_safe_dict(dict(line))) for line in lines]


@router.post("/{order_id}/lines", response_model=OrderLineResponse, status_code=status.HTTP_201_CREATED)
def create_order_line(order_id: int, payload: OrderLineCreate, request: Request):
    db = request.state.db
    actor = _actor(request)
    if not db.execute(text("SELECT id FROM orders WHERE id = :id"), {"id": order_id}).mappings().first():
        raise HTTPException(status_code=404, detail="Order not found")
    max_line = db.execute(
        text("SELECT COALESCE(MAX(line_number), 0) FROM order_lines WHERE order_id = :oid"),
        {"oid": order_id},
    ).scalar()
    line_number = max_line + 1
    row = db.execute(
        text("""
            INSERT INTO order_lines (order_id, line_number, color_id, ratio, delivery_qty,
                                     delivery_date, uom_id, selling_price, selling_cost, currency,
                                     product_id, version_id, category_id, sub_category_id)
            VALUES (:order_id, :line_number, :color_id, :ratio, :delivery_qty,
                    :delivery_date, :uom_id, :selling_price, :selling_cost, :currency,
                    :product_id, :version_id, :category_id, :sub_category_id)
            RETURNING id
        """),
        {
            "order_id": order_id, "line_number": line_number,
            "color_id": payload.color_id, "ratio": payload.ratio,
            "delivery_qty": payload.delivery_qty, "delivery_date": payload.delivery_date,
            "uom_id": payload.uom_id, "selling_price": payload.selling_price,
            "selling_cost": payload.selling_cost, "currency": payload.currency,
            "product_id": payload.product_id, "version_id": payload.version_id,
            "category_id": payload.category_id, "sub_category_id": payload.sub_category_id,
        },
    ).mappings().first()
    line_id = row["id"]
    for size_id in payload.size_ids:
        db.execute(
            text("INSERT INTO order_line_sizes (line_id, size_id) VALUES (:lid, :sid)"),
            {"lid": line_id, "sid": size_id},
        )
    log_change(db, "order_lines", line_id, "create", actor,
               new_data={
                   "order_id": order_id, "line_number": line_number,
                   "color_id": payload.color_id, "size_ids": payload.size_ids,
                   "ratio": payload.ratio, "delivery_qty": payload.delivery_qty,
                   "delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
                   "uom_id": payload.uom_id, "selling_price": payload.selling_price,
                   "selling_cost": payload.selling_cost, "currency": payload.currency,
                   "product_id": payload.product_id, "version_id": payload.version_id,
                   "category_id": payload.category_id, "sub_category_id": payload.sub_category_id,
               })
    db.commit()
    return OrderLineResponse(**_fetch_line_data(db, line_id))


@router.patch("/{order_id}/lines/{line_id}", response_model=OrderLineResponse)
def update_order_line(order_id: int, line_id: int, payload: OrderLineUpdate, request: Request):
    db = request.state.db
    row = db.execute(
        text("SELECT id FROM order_lines WHERE id = :id AND order_id = :oid"),
        {"id": line_id, "oid": order_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Order line not found")
    old_data = _fetch_line_data(db, line_id)
    data = payload.model_dump(exclude_unset=True)
    size_ids = data.pop("size_ids", None)
    if data:
        set_clause = ", ".join(f"{c} = :{c}" for c in data)
        data["id"] = line_id
        db.execute(text(f"UPDATE order_lines SET {set_clause} WHERE id = :id"), data)
    if size_ids is not None:
        db.execute(text("DELETE FROM order_line_sizes WHERE line_id = :lid"), {"lid": line_id})
        for size_id in size_ids:
            db.execute(
                text("INSERT INTO order_line_sizes (line_id, size_id) VALUES (:lid, :sid)"),
                {"lid": line_id, "sid": size_id},
            )
    new_data = _fetch_line_data(db, line_id)
    log_change(db, "order_lines", line_id, "update", _actor(request),
               old_data=old_data, new_data=new_data)
    db.commit()
    return OrderLineResponse(**_fetch_line_data(db, line_id))


@router.delete("/{order_id}/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order_line(order_id: int, line_id: int, request: Request):
    db = request.state.db
    row = db.execute(
        text("SELECT id FROM order_lines WHERE id = :id AND order_id = :oid"),
        {"id": line_id, "oid": order_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Order line not found")
    old_data = _fetch_line_data(db, line_id)
    db.execute(text("DELETE FROM order_lines WHERE id = :id"), {"id": line_id})
    log_change(db, "order_lines", line_id, "delete", _actor(request), old_data=old_data)
    db.commit()
