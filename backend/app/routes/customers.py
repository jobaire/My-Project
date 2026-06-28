import csv
import io
from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import text

from app.schemas.customer import (
    BrandCreate, BrandResponse, BrandUpdate,
    CustomerCreate, CustomerResponse, CustomerUpdate,
)
from app.schemas.pagination import Page
from app.services.audit import fetch_full_row, log_change

router = APIRouter()

_CUST_COLS = "id, name, customer_group, description, delivery_location, plan_colour, late_tolerance"
_BRAND_COLS = "id, customer_id, name, description"


def _actor(request):
    return request.state.user.get("email") or request.state.user.get("sub")


# ── Customers ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=Page[CustomerResponse])
def list_customers(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=10000),
    search: Optional[str] = Query(default=None),
    group: Optional[str] = Query(default=None),
):
    db = request.state.db
    offset = (page - 1) * page_size
    conditions, params = [], {}
    if search:
        conditions.append("(LOWER(name) LIKE :q OR LOWER(customer_group) LIKE :q)")
        params["q"] = f"%{search.lower()}%"
    if group:
        conditions.append("customer_group = :group")
        params["group"] = group
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    total = db.execute(text(f"SELECT COUNT(*) FROM customers {where}"), params).scalar()
    rows = db.execute(
        text(f"SELECT {_CUST_COLS} FROM customers {where} ORDER BY name LIMIT :lim OFFSET :off"),
        {**params, "lim": page_size, "off": offset},
    ).mappings().all()
    return Page(items=[CustomerResponse(**r) for r in rows], total=total, page=page, page_size=page_size)


# ── Static sub-paths — must be before /{customer_id} to avoid route shadowing ─

@router.get("/groups", response_model=list[str])
def list_groups(request: Request):
    rows = request.state.db.execute(
        text("SELECT DISTINCT customer_group FROM customers WHERE customer_group IS NOT NULL ORDER BY customer_group")
    ).all()
    return [r[0] for r in rows]


@router.get("/brands", response_model=list[BrandResponse])
def list_all_brands(request: Request):
    rows = request.state.db.execute(
        text(f"SELECT {_BRAND_COLS} FROM brands ORDER BY name")
    ).mappings().all()
    return [BrandResponse(**r) for r in rows]


# ── Import ─────────────────────────────────────────────────────────────────────

@router.get("/import/template")
def customer_import_template():
    lines = [
        "name,customer_group,description,delivery_location,plan_colour,late_tolerance",
        "Acme Corp,Retail,Main retail customer,London,#3B82F6,5",
    ]
    return StreamingResponse(
        io.StringIO("\n".join(lines) + "\n"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers_template.csv"},
    )


@router.post("/import/preview")
async def preview_customer_import(file: UploadFile = File(...)):
    raw = await file.read()
    csv_text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(csv_text))
    valid, errors = [], []
    for i, row in enumerate(reader, start=2):
        cleaned = {k.strip(): (v.strip() or None) for k, v in row.items()}
        try:
            lt = cleaned.get("late_tolerance")
            cleaned["late_tolerance"] = int(lt) if lt else 0
            payload = CustomerCreate(**cleaned)
            valid.append({"row": i, "data": payload.model_dump()})
        except ValidationError as e:
            first = e.errors()[0]
            field = str(first["loc"][0]) if first["loc"] else "field"
            errors.append({"row": i, "message": f"{field}: {first['msg']}"})
        except (ValueError, TypeError) as e:
            errors.append({"row": i, "message": str(e)})
    return {"valid": valid, "errors": errors}


@router.post("/import/confirm")
def confirm_customer_import(rows: list[CustomerCreate], request: Request):
    db = request.state.db
    for payload in rows:
        row = db.execute(
            text(
                "INSERT INTO customers (name, customer_group, description, delivery_location, plan_colour, late_tolerance) "
                "VALUES (:name, :customer_group, :description, :delivery_location, :plan_colour, :late_tolerance) "
                f"RETURNING {_CUST_COLS}"
            ),
            payload.model_dump(),
        ).mappings().first()
        log_change(db, "customers", row["id"], "create", _actor(request),
                   new_data=fetch_full_row(db, "customers", row["id"]))
    db.commit()
    return {"imported": len(rows)}


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, request: Request):
    row = request.state.db.execute(
        text(f"SELECT {_CUST_COLS} FROM customers WHERE id = :id"),
        {"id": customer_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse(**row)


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text(
            f"INSERT INTO customers (name, customer_group, description, delivery_location, plan_colour, late_tolerance) "
            f"VALUES (:name, :customer_group, :description, :delivery_location, :plan_colour, :late_tolerance) "
            f"RETURNING {_CUST_COLS}"
        ),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "customers", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "customers", row["id"]))
    db.commit()
    return CustomerResponse(**row)


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, payload: CustomerUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "customers", customer_id)
    if not old:
        raise HTTPException(status_code=404, detail="Customer not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = customer_id
    row = db.execute(
        text(f"UPDATE customers SET {set_clause} WHERE id = :id RETURNING {_CUST_COLS}"),
        updates,
    ).mappings().first()
    log_change(db, "customers", customer_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "customers", customer_id))
    db.commit()
    return CustomerResponse(**row)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "customers", customer_id)
    if not old:
        raise HTTPException(status_code=404, detail="Customer not found")
    has_styles = db.execute(
        text("SELECT 1 FROM products WHERE customer_id = :cid LIMIT 1"),
        {"cid": customer_id},
    ).first()
    if has_styles:
        raise HTTPException(status_code=400, detail="Customer has styles — delete those styles first")
    db.execute(text("DELETE FROM customers WHERE id = :id"), {"id": customer_id})
    log_change(db, "customers", customer_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Brands (per customer) ─────────────────────────────────────────────────────

@router.get("/{customer_id}/brands", response_model=list[BrandResponse])
def list_brands(customer_id: int, request: Request):
    rows = request.state.db.execute(
        text(f"SELECT {_BRAND_COLS} FROM brands WHERE customer_id = :cid ORDER BY name"),
        {"cid": customer_id},
    ).mappings().all()
    return [BrandResponse(**r) for r in rows]


@router.post("/{customer_id}/brands", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(customer_id: int, payload: BrandCreate, request: Request):
    db = request.state.db
    if not db.execute(text("SELECT id FROM customers WHERE id = :id"), {"id": customer_id}).mappings().first():
        raise HTTPException(status_code=404, detail="Customer not found")
    row = db.execute(
        text(f"INSERT INTO brands (customer_id, name, description) VALUES (:cid, :name, :description) RETURNING {_BRAND_COLS}"),
        {"cid": customer_id, **payload.model_dump()},
    ).mappings().first()
    log_change(db, "brands", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "brands", row["id"]))
    db.commit()
    return BrandResponse(**row)


@router.patch("/{customer_id}/brands/{brand_id}", response_model=BrandResponse)
def update_brand(customer_id: int, brand_id: int, payload: BrandUpdate, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM brands WHERE id = :id AND customer_id = :cid"),
        {"id": brand_id, "cid": customer_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Brand not found")
    old = dict(old)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = brand_id
    updates["cid"] = customer_id
    row = db.execute(
        text(f"UPDATE brands SET {set_clause} WHERE id = :id AND customer_id = :cid RETURNING {_BRAND_COLS}"),
        updates,
    ).mappings().first()
    new = db.execute(
        text("SELECT * FROM brands WHERE id = :id"), {"id": brand_id}
    ).mappings().first()
    log_change(db, "brands", brand_id, "update", _actor(request),
               old_data=old, new_data=dict(new))
    db.commit()
    return BrandResponse(**row)


@router.delete("/{customer_id}/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(customer_id: int, brand_id: int, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM brands WHERE id = :id AND customer_id = :cid"),
        {"id": brand_id, "cid": customer_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.execute(text("DELETE FROM brands WHERE id = :id"), {"id": brand_id})
    log_change(db, "brands", brand_id, "delete", _actor(request), old_data=dict(old))
    db.commit()
