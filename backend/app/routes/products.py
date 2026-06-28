import csv
import io
from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import text
from app.schemas.pagination import Page

from app.schemas.product import (
    ColorSizeEntry, ColorSizeRow,
    ProductCreate, ProductResponse, ProductUpdate,
    StyleVersionCreate, StyleVersionResponse, StyleVersionUpdate,
    VersionStepCreate, VersionStepResponse, VersionStepUpdate,
)
from app.services.audit import fetch_full_row, log_change

router = APIRouter()

_PROD_COLS = """
    p.id, p.name, p.description, p.sku, p.department,
    p.category_id,    sc.name  AS category_name,
    p.sub_category_id, ss.name AS sub_category_name,
    p.customer_id,    cu.name  AS customer_name,
    p.brand_id,       br.name  AS brand_name
"""

_VER_COLS   = "id, product_id, name"
_VSTEP_COLS = "id, version_id, sequence, process_name, unit_of_measurement, work_content"

_PROD_JOINS = """
    FROM products p
    LEFT JOIN style_categories     sc ON sc.id = p.category_id
    LEFT JOIN style_sub_categories ss ON ss.id = p.sub_category_id
    LEFT JOIN customers            cu ON cu.id = p.customer_id
    LEFT JOIN brands               br ON br.id = p.brand_id
"""


def _actor(request):
    return request.state.user.get("email") or request.state.user.get("sub")


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=Page[ProductResponse])
def list_products(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=10000),
    search: Optional[str] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    customer_id: Optional[int] = Query(default=None),
    brand_id: Optional[int] = Query(default=None),
):
    db = request.state.db
    offset = (page - 1) * page_size
    conditions, params = [], {}
    if search:
        conditions.append("(LOWER(p.name) LIKE :q OR LOWER(p.sku) LIKE :q)")
        params["q"] = f"%{search.lower()}%"
    if category_id is not None:
        conditions.append("p.category_id = :cat")
        params["cat"] = category_id
    if customer_id is not None:
        conditions.append("p.customer_id = :cust")
        params["cust"] = customer_id
    if brand_id is not None:
        conditions.append("p.brand_id = :brand")
        params["brand"] = brand_id
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    total = db.execute(text(f"SELECT COUNT(*) FROM products p {where}"), params).scalar()
    rows = db.execute(
        text(f"SELECT {_PROD_COLS} {_PROD_JOINS} {where} ORDER BY p.name LIMIT :lim OFFSET :off"),
        {**params, "lim": page_size, "off": offset},
    ).mappings().all()
    return Page(items=[ProductResponse(**r) for r in rows], total=total, page=page, page_size=page_size)


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("""
            INSERT INTO products (name, description, sku, department, category_id, sub_category_id, customer_id, brand_id)
            VALUES (:name, :description, :sku, :department, :category_id, :sub_category_id, :customer_id, :brand_id)
            RETURNING id
        """),
        payload.model_dump(),
    ).mappings().first()
    prod_id = row["id"]
    log_change(db, "products", prod_id, "create", _actor(request),
               new_data=fetch_full_row(db, "products", prod_id))
    db.commit()
    full = db.execute(
        text(f"SELECT {_PROD_COLS} {_PROD_JOINS} WHERE p.id = :id"), {"id": prod_id}
    ).mappings().first()
    return ProductResponse(**full)


# ── Import ─────────────────────────────────────────────────────────────────────

def _resolve_fk(db, table: str, name: str | None) -> tuple[int | None, str | None]:
    if not name:
        return None, None
    row = db.execute(
        text(f"SELECT id FROM {table} WHERE LOWER(name) = LOWER(:name)"), {"name": name}
    ).mappings().first()
    if not row:
        label = table.replace("style_", "").replace("_", " ")
        return None, f"'{name}' not found in {label}"
    return row["id"], None


# ── Import schemas ─────────────────────────────────────────────────────────────

class _ImportStep(BaseModel):
    process_name: str
    unit_of_measurement: Optional[str] = None
    work_content: Optional[str] = None

class _ImportVersion(BaseModel):
    name: str
    steps: list[_ImportStep]

class _ImportProductRow(BaseModel):
    product: ProductCreate
    versions: list[_ImportVersion]
    color_ids: list[int]
    size_ids: list[int]


@router.get("/import/template")
def product_import_template():
    lines = [
        "name,description,sku,department,customer_name,brand_name,category_name,sub_category_name,"
        "version_name,process_name,unit_of_measurement,work_content,colors,sizes",
        "Classic Tee,Cotton t-shirt,SKU-001,Womenswear,Acme Corp,Nike Brand,Tops,T-Shirts,"
        "Version 1,Cutting,pcs,0.5,Red|Blue,S|M|L|XL",
        "Classic Tee,,,,,,,,"
        "Version 1,Sewing,pcs,2.0,,",
        "Classic Tee,,,,,,,,"
        "Version 1,Finishing,pcs,0.3,,",
    ]
    return StreamingResponse(
        io.StringIO("\n".join(lines) + "\n"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products_template.csv"},
    )


@router.post("/import/preview")
async def preview_product_import(request: Request, file: UploadFile = File(...)):
    db = request.state.db
    raw = await file.read()
    csv_text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(csv_text))

    # Collect all rows then group by product name
    all_rows = [(i, {k.strip(): (v.strip() or None) for k, v in row.items()})
                for i, row in enumerate(reader, start=2)]

    groups: dict[str, list] = {}
    for i, raw_row in all_rows:
        key = (raw_row.get("name") or "").strip().lower()
        if key not in groups:
            groups[key] = []
        groups[key].append((i, raw_row))

    valid, errors = [], []

    for key, group_rows in groups.items():
        row_nums   = [i for i, _ in group_rows]
        row_label  = str(row_nums[0]) if len(row_nums) == 1 else f"{row_nums[0]}–{row_nums[-1]}"
        first_i, first_raw = group_rows[0]

        if not key:
            errors.append({"row": row_label, "message": "name: field required"})
            continue

        # Resolve product foreign keys from the first row
        grp_errors = []
        customer_id,     err = _resolve_fk(db, "customers",            first_raw.get("customer_name")); grp_errors += [err] if err else []
        brand_id,        err = _resolve_fk(db, "brands",               first_raw.get("brand_name"));    grp_errors += [err] if err else []
        category_id,     err = _resolve_fk(db, "style_categories",     first_raw.get("category_name")); grp_errors += [err] if err else []
        sub_category_id, err = _resolve_fk(db, "style_sub_categories", first_raw.get("sub_category_name")); grp_errors += [err] if err else []

        if grp_errors:
            errors.append({"row": row_label, "message": "; ".join(grp_errors)})
            continue

        try:
            product = ProductCreate(
                name=first_raw.get("name"),
                description=first_raw.get("description"),
                sku=first_raw.get("sku"),
                department=first_raw.get("department"),
                customer_id=customer_id, brand_id=brand_id,
                category_id=category_id, sub_category_id=sub_category_id,
            )
        except ValidationError as e:
            err0 = e.errors()[0]
            errors.append({"row": row_label, "message": f"{err0['loc'][0]}: {err0['msg']}"})
            continue

        # Group steps by version
        versions_dict: dict[str, list] = {}
        for _, raw_row in group_rows:
            ver_name = (raw_row.get("version_name") or "Version 1").strip()
            if ver_name not in versions_dict:
                versions_dict[ver_name] = []
            process = raw_row.get("process_name")
            if process:
                versions_dict[ver_name].append({
                    "process_name": process,
                    "unit_of_measurement": raw_row.get("unit_of_measurement"),
                    "work_content": raw_row.get("work_content"),
                })

        versions = [{"name": vn, "steps": steps} for vn, steps in versions_dict.items()]

        # Collect unique color and size names from all rows in this group
        color_names: set[str] = set()
        size_names:  set[str] = set()
        for _, raw_row in group_rows:
            for c in (raw_row.get("colors") or "").split("|"):
                if c.strip(): color_names.add(c.strip())
            for s in (raw_row.get("sizes") or "").split("|"):
                if s.strip(): size_names.add(s.strip())

        color_ids, size_ids, cs_errors = [], [], []
        for cn in sorted(color_names):
            cid, err = _resolve_fk(db, "colors", cn)
            if err: cs_errors.append(err)
            else:   color_ids.append(cid)
        for sn in sorted(size_names):
            sid, err = _resolve_fk(db, "sizes", sn)
            if err: cs_errors.append(err)
            else:   size_ids.append(sid)

        if cs_errors:
            errors.append({"row": row_label, "message": "; ".join(cs_errors)})
            continue

        total_steps = sum(len(v["steps"]) for v in versions)
        preview = {
            "product":  first_raw.get("name") or "—",
            "sku":      first_raw.get("sku") or "—",
            "customer": first_raw.get("customer_name") or "—",
            "versions": str(len(versions)),
            "steps":    str(total_steps),
            "colors":   ", ".join(sorted(color_names)) if color_names else "—",
            "sizes":    ", ".join(sorted(size_names))  if size_names  else "—",
        }
        valid.append({
            "row": row_label,
            "data": {
                "product":   product.model_dump(),
                "versions":  versions,
                "color_ids": color_ids,
                "size_ids":  size_ids,
            },
            "preview": preview,
        })

    return {"valid": valid, "errors": errors}


@router.post("/import/confirm")
def confirm_product_import(rows: list[_ImportProductRow], request: Request):
    db = request.state.db
    actor = _actor(request)

    for item in rows:
        # 1. Create product
        prod_row = db.execute(
            text("""
                INSERT INTO products (name, description, sku, department, category_id, sub_category_id, customer_id, brand_id)
                VALUES (:name, :description, :sku, :department, :category_id, :sub_category_id, :customer_id, :brand_id)
                RETURNING id
            """),
            item.product.model_dump(),
        ).mappings().first()
        prod_id = prod_row["id"]
        log_change(db, "products", prod_id, "create", actor,
                   new_data=fetch_full_row(db, "products", prod_id))

        # 2. Create versions and their steps
        for ver in item.versions:
            ver_row = db.execute(
                text("INSERT INTO style_versions (product_id, name) VALUES (:pid, :name) RETURNING id"),
                {"pid": prod_id, "name": ver.name},
            ).mappings().first()
            ver_id = ver_row["id"]
            log_change(db, "style_versions", ver_id, "create", actor,
                       new_data=fetch_full_row(db, "style_versions", ver_id))

            for seq, step in enumerate(ver.steps, start=1):
                step_row = db.execute(
                    text(
                        "INSERT INTO style_version_steps "
                        "(version_id, sequence, process_name, unit_of_measurement, work_content) "
                        "VALUES (:vid, :seq, :pn, :uom, :wc) RETURNING id"
                    ),
                    {"vid": ver_id, "seq": seq, "pn": step.process_name,
                     "uom": step.unit_of_measurement, "wc": step.work_content},
                ).mappings().first()
                log_change(db, "style_version_steps", step_row["id"], "create", actor,
                           new_data=fetch_full_row(db, "style_version_steps", step_row["id"]))

        # 3. Create color-size matrix (all combinations)
        if item.color_ids and item.size_ids:
            for color_id in item.color_ids:
                for size_id in item.size_ids:
                    db.execute(
                        text(
                            "INSERT INTO product_color_sizes (product_id, color_id, size_id) "
                            "VALUES (:pid, :cid, :sid) ON CONFLICT DO NOTHING"
                        ),
                        {"pid": prod_id, "cid": color_id, "sid": size_id},
                    )
            log_change(db, "product_color_sizes", prod_id, "create", actor,
                       new_data={"entries": [{"color_id": c, "size_ids": item.size_ids}
                                             for c in item.color_ids]})

    db.commit()
    return {"imported": len(rows)}


@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, payload: ProductUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "products", product_id)
    if not old:
        raise HTTPException(status_code=404, detail="Product not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = product_id
    db.execute(text(f"UPDATE products SET {set_clause} WHERE id = :id"), updates)
    log_change(db, "products", product_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "products", product_id))
    db.commit()
    full = db.execute(
        text(f"SELECT {_PROD_COLS} {_PROD_JOINS} WHERE p.id = :id"), {"id": product_id}
    ).mappings().first()
    return ProductResponse(**full)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "products", product_id)
    if not old:
        raise HTTPException(status_code=404, detail="Product not found")
    has_orders = db.execute(
        text("""
            SELECT 1 FROM orders WHERE product_id = :pid
            UNION ALL
            SELECT 1 FROM order_lines WHERE product_id = :pid
            LIMIT 1
        """),
        {"pid": product_id},
    ).first()
    if has_orders:
        raise HTTPException(status_code=400, detail="Style is used in one or more orders — remove those orders first")
    db.execute(text("DELETE FROM products WHERE id = :id"), {"id": product_id})
    log_change(db, "products", product_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Style versions ─────────────────────────────────────────────────────────────

@router.get("/{product_id}/versions", response_model=list[StyleVersionResponse])
def list_versions(product_id: int, request: Request):
    rows = request.state.db.execute(
        text(f"SELECT {_VER_COLS} FROM style_versions WHERE product_id = :pid ORDER BY id"),
        {"pid": product_id},
    ).mappings().all()
    return [StyleVersionResponse(**r) for r in rows]


@router.post("/{product_id}/versions", response_model=StyleVersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(product_id: int, payload: StyleVersionCreate, request: Request):
    db = request.state.db
    if not db.execute(text("SELECT id FROM products WHERE id = :id"), {"id": product_id}).mappings().first():
        raise HTTPException(status_code=404, detail="Product not found")
    row = db.execute(
        text(f"INSERT INTO style_versions (product_id, name) VALUES (:pid, :name) RETURNING {_VER_COLS}"),
        {"pid": product_id, "name": payload.name},
    ).mappings().first()
    log_change(db, "style_versions", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "style_versions", row["id"]))
    db.commit()
    return StyleVersionResponse(**row)


@router.patch("/{product_id}/versions/{version_id}", response_model=StyleVersionResponse)
def update_version(product_id: int, version_id: int, payload: StyleVersionUpdate, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM style_versions WHERE id = :id AND product_id = :pid"),
        {"id": version_id, "pid": product_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Version not found")
    old = dict(old)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = version_id
    updates["pid"] = product_id
    row = db.execute(
        text(f"UPDATE style_versions SET {set_clause} WHERE id = :id AND product_id = :pid RETURNING {_VER_COLS}"),
        updates,
    ).mappings().first()
    log_change(db, "style_versions", version_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "style_versions", version_id))
    db.commit()
    return StyleVersionResponse(**row)


@router.delete("/{product_id}/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_version(product_id: int, version_id: int, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM style_versions WHERE id = :id AND product_id = :pid"),
        {"id": version_id, "pid": product_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Version not found")
    has_orders = db.execute(
        text("""
            SELECT 1 FROM orders WHERE version_id = :vid
            UNION ALL
            SELECT 1 FROM order_lines WHERE version_id = :vid
            LIMIT 1
        """),
        {"vid": version_id},
    ).first()
    if has_orders:
        raise HTTPException(status_code=400, detail="Style version is used in one or more orders — remove those orders first")
    db.execute(text("DELETE FROM style_versions WHERE id = :id"), {"id": version_id})
    log_change(db, "style_versions", version_id, "delete", _actor(request), old_data=dict(old))
    db.commit()


# ── Version steps ──────────────────────────────────────────────────────────────

@router.get("/{product_id}/versions/{version_id}/steps", response_model=list[VersionStepResponse])
def list_version_steps(product_id: int, version_id: int, request: Request):
    rows = request.state.db.execute(
        text(f"SELECT {_VSTEP_COLS} FROM style_version_steps WHERE version_id = :vid ORDER BY sequence, id"),
        {"vid": version_id},
    ).mappings().all()
    return [VersionStepResponse(**r) for r in rows]


@router.post("/{product_id}/versions/{version_id}/steps", response_model=VersionStepResponse, status_code=status.HTTP_201_CREATED)
def create_version_step(product_id: int, version_id: int, payload: VersionStepCreate, request: Request):
    db = request.state.db
    next_seq = db.execute(
        text("SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM style_version_steps WHERE version_id = :vid"),
        {"vid": version_id},
    ).mappings().first()["seq"]
    row = db.execute(
        text(
            "INSERT INTO style_version_steps (version_id, sequence, process_name, unit_of_measurement, work_content) "
            "VALUES (:vid, :sequence, :process_name, :unit_of_measurement, :work_content) "
            f"RETURNING {_VSTEP_COLS}"
        ),
        {"vid": version_id, "sequence": next_seq, **payload.model_dump()},
    ).mappings().first()
    log_change(db, "style_version_steps", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "style_version_steps", row["id"]))
    db.commit()
    return VersionStepResponse(**row)


# reorder must be before /{step_id} to avoid route shadowing
@router.patch("/{product_id}/versions/{version_id}/steps/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_steps(product_id: int, version_id: int, order: list[int], request: Request):
    db = request.state.db
    for seq, step_id in enumerate(order, start=1):
        db.execute(
            text("UPDATE style_version_steps SET sequence = :seq WHERE id = :id AND version_id = :vid"),
            {"seq": seq, "id": step_id, "vid": version_id},
        )
    log_change(db, "style_version_steps", version_id, "reorder", _actor(request),
               new_data={"version_id": version_id, "order": order})
    db.commit()


@router.patch("/{product_id}/versions/{version_id}/steps/{step_id}", response_model=VersionStepResponse)
def update_version_step(product_id: int, version_id: int, step_id: int, payload: VersionStepUpdate, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM style_version_steps WHERE id = :id AND version_id = :vid"),
        {"id": step_id, "vid": version_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Step not found")
    old = dict(old)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = step_id
    updates["vid"] = version_id
    row = db.execute(
        text(f"UPDATE style_version_steps SET {set_clause} WHERE id = :id AND version_id = :vid RETURNING {_VSTEP_COLS}"),
        updates,
    ).mappings().first()
    log_change(db, "style_version_steps", step_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "style_version_steps", step_id))
    db.commit()
    return VersionStepResponse(**row)


@router.delete("/{product_id}/versions/{version_id}/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_version_step(product_id: int, version_id: int, step_id: int, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT * FROM style_version_steps WHERE id = :id AND version_id = :vid"),
        {"id": step_id, "vid": version_id},
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Step not found")
    db.execute(text("DELETE FROM style_version_steps WHERE id = :id"), {"id": step_id})
    log_change(db, "style_version_steps", step_id, "delete", _actor(request), old_data=dict(old))
    db.commit()


# ── Color-Size matrix ──────────────────────────────────────────────────────────

@router.get("/{product_id}/color-sizes", response_model=list[ColorSizeRow])
def get_color_sizes(product_id: int, request: Request):
    db = request.state.db
    rows = db.execute(
        text("""
            SELECT pcs.color_id, c.name AS color_name, array_agg(pcs.size_id ORDER BY pcs.size_id) AS size_ids
            FROM product_color_sizes pcs
            JOIN colors c ON c.id = pcs.color_id
            WHERE pcs.product_id = :pid
            GROUP BY pcs.color_id, c.name
            ORDER BY c.name
        """),
        {"pid": product_id},
    ).mappings().all()
    return [ColorSizeRow(color_id=r["color_id"], color_name=r["color_name"], size_ids=list(r["size_ids"])) for r in rows]


@router.put("/{product_id}/color-sizes", status_code=status.HTTP_204_NO_CONTENT)
def save_color_sizes(product_id: int, entries: list[ColorSizeEntry], request: Request):
    db = request.state.db
    old_rows = db.execute(
        text("SELECT color_id, size_id FROM product_color_sizes WHERE product_id = :pid ORDER BY color_id, size_id"),
        {"pid": product_id},
    ).mappings().all()
    db.execute(text("DELETE FROM product_color_sizes WHERE product_id = :pid"), {"pid": product_id})
    for entry in entries:
        for size_id in entry.size_ids:
            db.execute(
                text("INSERT INTO product_color_sizes (product_id, color_id, size_id) VALUES (:pid, :cid, :sid)"),
                {"pid": product_id, "cid": entry.color_id, "sid": size_id},
            )
    log_change(db, "product_color_sizes", product_id, "update", _actor(request),
               old_data={"entries": [dict(r) for r in old_rows]},
               new_data={"entries": [{"color_id": e.color_id, "size_ids": e.size_ids} for e in entries]})
    db.commit()
