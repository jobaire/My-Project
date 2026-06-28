from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.master import get_master_db
from app.schemas.setup import (
    CategoryCreate, CategoryResponse,
    ColorCreate, ColorResponse,
    CompanyRoleCreate, CompanyRoleResponse, CompanyRoleUpdate,
    ModulePermissionRow, ModulePermissionUpdate,
    NameUpdate,
    ProcessCreate, ProcessResponse, ProcessUpdate,
    SeasonCreate, SeasonResponse, SeasonUpdate,
    SizeCreate, SizeResponse, SizeUpdate,
    SizeSetCreate, SizeSetResponse, SizeSetUpdate,
    SubCategoryCreate, SubCategoryResponse,
    SubTenantCreate, SubTenantResponse, SubTenantUpdate,
    UoMCreate, UoMResponse, UoMUpdate,
)
from app.services.audit import fetch_full_row, log_change

router = APIRouter()

_PROC_COLS = "id, name, short_name, external_reference, sequence, work_content_unit, planned, update_by_size"


def _actor(request):
    return request.state.user.get("email") or request.state.user.get("sub")


# ── Processes ─────────────────────────────────────────────────────────────────

@router.get("/processes", response_model=list[ProcessResponse])
def list_processes(request: Request):
    rows = request.state.db.execute(
        text(f"SELECT {_PROC_COLS} FROM processes ORDER BY sequence, name")
    ).mappings().all()
    return [ProcessResponse(**r) for r in rows]


@router.post("/processes", response_model=ProcessResponse, status_code=status.HTTP_201_CREATED)
def create_process(payload: ProcessCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text(
            "INSERT INTO processes (name, short_name, external_reference, sequence, work_content_unit, planned, update_by_size) "
            "VALUES (:name, :short_name, :external_reference, :sequence, :work_content_unit, :planned, :update_by_size) "
            f"RETURNING {_PROC_COLS}"
        ),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "processes", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "processes", row["id"]))
    db.commit()
    return ProcessResponse(**row)


@router.patch("/processes/{process_id}", response_model=ProcessResponse)
def update_process(process_id: int, payload: ProcessUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "processes", process_id)
    if not old:
        raise HTTPException(status_code=404, detail="Process not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = process_id
    row = db.execute(
        text(f"UPDATE processes SET {set_clause} WHERE id = :id RETURNING {_PROC_COLS}"),
        updates,
    ).mappings().first()
    log_change(db, "processes", process_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "processes", process_id))
    db.commit()
    return ProcessResponse(**row)


@router.delete("/processes/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process(process_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "processes", process_id)
    if not old:
        raise HTTPException(status_code=404, detail="Process not found")
    db.execute(text("DELETE FROM processes WHERE id = :id"), {"id": process_id})
    log_change(db, "processes", process_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Style Categories ──────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(request: Request):
    rows = request.state.db.execute(
        text("SELECT id, name FROM style_categories ORDER BY name")
    ).mappings().all()
    return [CategoryResponse(**r) for r in rows]


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO style_categories (name) VALUES (:name) RETURNING id, name"),
        {"name": payload.name},
    ).mappings().first()
    log_change(db, "style_categories", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "style_categories", row["id"]))
    db.commit()
    return CategoryResponse(**row)


@router.patch("/categories/{cat_id}", response_model=CategoryResponse)
def update_category(cat_id: int, payload: NameUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "style_categories", cat_id)
    if not old:
        raise HTTPException(status_code=404, detail="Category not found")
    row = db.execute(
        text("UPDATE style_categories SET name = :name WHERE id = :id RETURNING id, name"),
        {"name": payload.name, "id": cat_id},
    ).mappings().first()
    log_change(db, "style_categories", cat_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "style_categories", cat_id))
    db.commit()
    return CategoryResponse(**row)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "style_categories", cat_id)
    if not old:
        raise HTTPException(status_code=404, detail="Category not found")
    db.execute(text("DELETE FROM style_categories WHERE id = :id"), {"id": cat_id})
    log_change(db, "style_categories", cat_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Sub-Categories ────────────────────────────────────────────────────────────

@router.get("/sub-categories", response_model=list[SubCategoryResponse])
def list_sub_categories(request: Request, category_id: Optional[int] = Query(default=None)):
    db = request.state.db
    if category_id:
        rows = db.execute(
            text("SELECT id, category_id, name FROM style_sub_categories WHERE category_id = :cid ORDER BY name"),
            {"cid": category_id},
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT id, category_id, name FROM style_sub_categories ORDER BY name")
        ).mappings().all()
    return [SubCategoryResponse(**r) for r in rows]


@router.post("/sub-categories", response_model=SubCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_sub_category(payload: SubCategoryCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO style_sub_categories (category_id, name) VALUES (:category_id, :name) RETURNING id, category_id, name"),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "style_sub_categories", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "style_sub_categories", row["id"]))
    db.commit()
    return SubCategoryResponse(**row)


@router.patch("/sub-categories/{sub_id}", response_model=SubCategoryResponse)
def update_sub_category(sub_id: int, payload: NameUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "style_sub_categories", sub_id)
    if not old:
        raise HTTPException(status_code=404, detail="Sub-category not found")
    row = db.execute(
        text("UPDATE style_sub_categories SET name = :name WHERE id = :id RETURNING id, category_id, name"),
        {"name": payload.name, "id": sub_id},
    ).mappings().first()
    log_change(db, "style_sub_categories", sub_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "style_sub_categories", sub_id))
    db.commit()
    return SubCategoryResponse(**row)


@router.delete("/sub-categories/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sub_category(sub_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "style_sub_categories", sub_id)
    if not old:
        raise HTTPException(status_code=404, detail="Sub-category not found")
    db.execute(text("DELETE FROM style_sub_categories WHERE id = :id"), {"id": sub_id})
    log_change(db, "style_sub_categories", sub_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Colors ────────────────────────────────────────────────────────────────────

@router.get("/colors", response_model=list[ColorResponse])
def list_colors(request: Request):
    rows = request.state.db.execute(
        text("SELECT id, name FROM colors ORDER BY name")
    ).mappings().all()
    return [ColorResponse(**r) for r in rows]


@router.post("/colors", response_model=ColorResponse, status_code=status.HTTP_201_CREATED)
def create_color(payload: ColorCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO colors (name) VALUES (:name) RETURNING id, name"),
        {"name": payload.name},
    ).mappings().first()
    log_change(db, "colors", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "colors", row["id"]))
    db.commit()
    return ColorResponse(**row)


@router.patch("/colors/{color_id}", response_model=ColorResponse)
def update_color(color_id: int, payload: NameUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "colors", color_id)
    if not old:
        raise HTTPException(status_code=404, detail="Color not found")
    row = db.execute(
        text("UPDATE colors SET name = :name WHERE id = :id RETURNING id, name"),
        {"name": payload.name, "id": color_id},
    ).mappings().first()
    log_change(db, "colors", color_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "colors", color_id))
    db.commit()
    return ColorResponse(**row)


@router.delete("/colors/{color_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_color(color_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "colors", color_id)
    if not old:
        raise HTTPException(status_code=404, detail="Color not found")
    db.execute(text("DELETE FROM colors WHERE id = :id"), {"id": color_id})
    log_change(db, "colors", color_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Sizes ─────────────────────────────────────────────────────────────────────

@router.get("/sizes", response_model=list[SizeResponse])
def list_sizes(request: Request):
    rows = request.state.db.execute(
        text("SELECT id, name, sequence FROM sizes ORDER BY sequence, name")
    ).mappings().all()
    return [SizeResponse(**r) for r in rows]


@router.post("/sizes", response_model=SizeResponse, status_code=status.HTTP_201_CREATED)
def create_size(payload: SizeCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO sizes (name, sequence) VALUES (:name, :sequence) RETURNING id, name, sequence"),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "sizes", row["id"], "create", _actor(request),
               new_data=fetch_full_row(db, "sizes", row["id"]))
    db.commit()
    return SizeResponse(**row)


@router.patch("/sizes/{size_id}", response_model=SizeResponse)
def update_size(size_id: int, payload: SizeUpdate, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "sizes", size_id)
    if not old:
        raise HTTPException(status_code=404, detail="Size not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = size_id
    row = db.execute(
        text(f"UPDATE sizes SET {set_clause} WHERE id = :id RETURNING id, name, sequence"),
        updates,
    ).mappings().first()
    log_change(db, "sizes", size_id, "update", _actor(request),
               old_data=old, new_data=fetch_full_row(db, "sizes", size_id))
    db.commit()
    return SizeResponse(**row)


@router.delete("/sizes/{size_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_size(size_id: int, request: Request):
    db = request.state.db
    old = fetch_full_row(db, "sizes", size_id)
    if not old:
        raise HTTPException(status_code=404, detail="Size not found")
    db.execute(text("DELETE FROM sizes WHERE id = :id"), {"id": size_id})
    log_change(db, "sizes", size_id, "delete", _actor(request), old_data=old)
    db.commit()


# ── Size Sets ─────────────────────────────────────────────────────────────────

@router.get("/size-sets", response_model=list[SizeSetResponse])
def list_size_sets(request: Request):
    db = request.state.db
    sets = db.execute(text("SELECT id, name FROM size_sets ORDER BY name")).mappings().all()
    result = []
    for s in sets:
        members = db.execute(
            text("SELECT sz.id, sz.name, sz.sequence FROM size_set_members m JOIN sizes sz ON sz.id = m.size_id WHERE m.size_set_id = :sid ORDER BY sz.sequence, sz.name"),
            {"sid": s["id"]},
        ).mappings().all()
        result.append(SizeSetResponse(id=s["id"], name=s["name"], sizes=[SizeResponse(**m) for m in members]))
    return result


@router.post("/size-sets", response_model=SizeSetResponse, status_code=status.HTTP_201_CREATED)
def create_size_set(payload: SizeSetCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO size_sets (name) VALUES (:name) RETURNING id, name"),
        {"name": payload.name},
    ).mappings().first()
    set_id = row["id"]
    for size_id in payload.size_ids:
        db.execute(text("INSERT INTO size_set_members (size_set_id, size_id) VALUES (:sid, :szid)"), {"sid": set_id, "szid": size_id})
    members = db.execute(
        text("SELECT sz.id, sz.name, sz.sequence FROM size_set_members m JOIN sizes sz ON sz.id = m.size_id WHERE m.size_set_id = :sid ORDER BY sz.sequence, sz.name"),
        {"sid": set_id},
    ).mappings().all()
    log_change(db, "size_sets", set_id, "create", _actor(request),
               new_data={"id": set_id, "name": row["name"], "size_ids": payload.size_ids})
    db.commit()
    return SizeSetResponse(id=set_id, name=row["name"], sizes=[SizeResponse(**m) for m in members])


@router.patch("/size-sets/{set_id}", response_model=SizeSetResponse)
def update_size_set(set_id: int, payload: SizeSetUpdate, request: Request):
    db = request.state.db
    row = db.execute(text("SELECT id, name FROM size_sets WHERE id = :id"), {"id": set_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Size set not found")
    old_members = db.execute(
        text("SELECT size_id FROM size_set_members WHERE size_set_id = :sid ORDER BY size_id"),
        {"sid": set_id},
    ).mappings().all()
    old_data = {"id": set_id, "name": row["name"], "size_ids": [m["size_id"] for m in old_members]}
    name = payload.name if payload.name is not None else row["name"]
    if payload.name is not None:
        db.execute(text("UPDATE size_sets SET name = :name WHERE id = :id"), {"name": name, "id": set_id})
    if payload.size_ids is not None:
        db.execute(text("DELETE FROM size_set_members WHERE size_set_id = :sid"), {"sid": set_id})
        for size_id in payload.size_ids:
            db.execute(
                text("INSERT INTO size_set_members (size_set_id, size_id) VALUES (:sid, :szid)"),
                {"sid": set_id, "szid": size_id},
            )
    new_size_ids = payload.size_ids if payload.size_ids is not None else [m["size_id"] for m in old_members]
    log_change(db, "size_sets", set_id, "update", _actor(request),
               old_data=old_data, new_data={"id": set_id, "name": name, "size_ids": new_size_ids})
    db.commit()
    members = db.execute(
        text("SELECT sz.id, sz.name, sz.sequence FROM size_set_members m JOIN sizes sz ON sz.id = m.size_id WHERE m.size_set_id = :sid ORDER BY sz.sequence, sz.name"),
        {"sid": set_id},
    ).mappings().all()
    return SizeSetResponse(id=set_id, name=name, sizes=[SizeResponse(**m) for m in members])


@router.delete("/size-sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_size_set(set_id: int, request: Request):
    db = request.state.db
    row = db.execute(text("SELECT id, name FROM size_sets WHERE id = :id"), {"id": set_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Size set not found")
    old_members = db.execute(
        text("SELECT size_id FROM size_set_members WHERE size_set_id = :sid ORDER BY size_id"),
        {"sid": set_id},
    ).mappings().all()
    old_data = {"id": set_id, "name": row["name"], "size_ids": [m["size_id"] for m in old_members]}
    db.execute(text("DELETE FROM size_sets WHERE id = :id"), {"id": set_id})
    log_change(db, "size_sets", set_id, "delete", _actor(request), old_data=old_data)
    db.commit()


# ── Seasons ───────────────────────────────────────────────────────────────────

@router.get("/seasons", response_model=list[SeasonResponse])
def list_seasons(request: Request):
    rows = request.state.db.execute(
        text("SELECT id, name, year FROM seasons ORDER BY year DESC NULLS LAST, name")
    ).mappings().all()
    return [SeasonResponse(**r) for r in rows]


@router.post("/seasons", response_model=SeasonResponse, status_code=status.HTTP_201_CREATED)
def create_season(payload: SeasonCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO seasons (name, year) VALUES (:name, :year) RETURNING id, name, year"),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "seasons", row["id"], "create", _actor(request),
               new_data={"id": row["id"], "name": row["name"], "year": row["year"]})
    db.commit()
    return SeasonResponse(**row)


@router.patch("/seasons/{season_id}", response_model=SeasonResponse)
def update_season(season_id: int, payload: SeasonUpdate, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT id, name, year FROM seasons WHERE id = :id"), {"id": season_id}
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Season not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = season_id
    row = db.execute(
        text(f"UPDATE seasons SET {set_clause} WHERE id = :id RETURNING id, name, year"),
        updates,
    ).mappings().first()
    log_change(db, "seasons", season_id, "update", _actor(request),
               old_data={"id": dict(old)["id"], "name": dict(old)["name"], "year": dict(old)["year"]},
               new_data={"id": row["id"], "name": row["name"], "year": row["year"]})
    db.commit()
    return SeasonResponse(**row)


@router.delete("/seasons/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_season(season_id: int, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT id, name, year FROM seasons WHERE id = :id"), {"id": season_id}
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="Season not found")
    db.execute(text("DELETE FROM seasons WHERE id = :id"), {"id": season_id})
    log_change(db, "seasons", season_id, "delete", _actor(request),
               old_data={"id": dict(old)["id"], "name": dict(old)["name"], "year": dict(old)["year"]})
    db.commit()


# ── Units of Measure ──────────────────────────────────────────────────────────

@router.get("/uom", response_model=list[UoMResponse])
def list_uom(request: Request):
    rows = request.state.db.execute(
        text("SELECT id, name, abbreviation FROM uom ORDER BY name")
    ).mappings().all()
    return [UoMResponse(**r) for r in rows]


@router.post("/uom", response_model=UoMResponse, status_code=status.HTTP_201_CREATED)
def create_uom(payload: UoMCreate, request: Request):
    db = request.state.db
    row = db.execute(
        text("INSERT INTO uom (name, abbreviation) VALUES (:name, :abbreviation) RETURNING id, name, abbreviation"),
        payload.model_dump(),
    ).mappings().first()
    log_change(db, "uom", row["id"], "create", _actor(request),
               new_data={"id": row["id"], "name": row["name"], "abbreviation": row["abbreviation"]})
    db.commit()
    return UoMResponse(**row)


@router.patch("/uom/{uom_id}", response_model=UoMResponse)
def update_uom(uom_id: int, payload: UoMUpdate, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT id, name, abbreviation FROM uom WHERE id = :id"), {"id": uom_id}
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="UoM not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = uom_id
    row = db.execute(
        text(f"UPDATE uom SET {set_clause} WHERE id = :id RETURNING id, name, abbreviation"),
        updates,
    ).mappings().first()
    log_change(db, "uom", uom_id, "update", _actor(request),
               old_data={"id": dict(old)["id"], "name": dict(old)["name"], "abbreviation": dict(old)["abbreviation"]},
               new_data={"id": row["id"], "name": row["name"], "abbreviation": row["abbreviation"]})
    db.commit()
    return UoMResponse(**row)


@router.delete("/uom/{uom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_uom(uom_id: int, request: Request):
    db = request.state.db
    old = db.execute(
        text("SELECT id, name, abbreviation FROM uom WHERE id = :id"), {"id": uom_id}
    ).mappings().first()
    if not old:
        raise HTTPException(status_code=404, detail="UoM not found")
    db.execute(text("DELETE FROM uom WHERE id = :id"), {"id": uom_id})
    log_change(db, "uom", uom_id, "delete", _actor(request),
               old_data={"id": dict(old)["id"], "name": dict(old)["name"], "abbreviation": dict(old)["abbreviation"]})
    db.commit()


# ── Sub-Companies (master DB — scoped to caller's company) ────────────────────

def _require_admin(request: Request):
    user = request.state.user
    roles = user.get("roles") or ([user["role"]] if user.get("role") else [])
    if not any(r in {"admin", "super_admin"} for r in roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/sub-tenants", response_model=list[SubTenantResponse])
def list_sub_tenants(request: Request, db: Session = Depends(get_master_db)):
    tenant_id = request.state.user.get("tenant_id")
    rows = db.execute(
        text("SELECT id, tenant_id, name, code, is_active FROM sub_tenants WHERE tenant_id = :cid ORDER BY name"),
        {"cid": tenant_id},
    ).mappings().all()
    return [SubTenantResponse(**r) for r in rows]


@router.post("/sub-tenants", response_model=SubTenantResponse, status_code=status.HTTP_201_CREATED)
def create_sub_company(payload: SubTenantCreate, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    row = db.execute(
        text("INSERT INTO sub_tenants (tenant_id, name, code, is_active) VALUES (:cid, :name, :code, :active) RETURNING id, tenant_id, name, code, is_active"),
        {"cid": tenant_id, "name": payload.name, "code": payload.code, "active": payload.is_active},
    ).mappings().first()
    db.commit()
    return SubTenantResponse(**row)


@router.patch("/sub-tenants/{sc_id}", response_model=SubTenantResponse)
def update_sub_company(sc_id: int, payload: SubTenantUpdate, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    existing = db.execute(
        text("SELECT id FROM sub_tenants WHERE id = :id AND tenant_id = :cid"),
        {"id": sc_id, "cid": tenant_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Sub-company not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
    updates["id"] = sc_id
    row = db.execute(
        text(f"UPDATE sub_tenants SET {set_clause} WHERE id = :id RETURNING id, tenant_id, name, code, is_active"),
        updates,
    ).mappings().first()
    db.commit()
    return SubTenantResponse(**row)


@router.delete("/sub-tenants/{sc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sub_company(sc_id: int, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    existing = db.execute(
        text("SELECT id FROM sub_tenants WHERE id = :id AND tenant_id = :cid"),
        {"id": sc_id, "cid": tenant_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Sub-company not found")
    db.execute(text("DELETE FROM sub_tenants WHERE id = :id"), {"id": sc_id})
    db.commit()


# ── Company Roles (master DB) ─────────────────────────────────────────────────

APP_MODULES = ["orders", "products", "customers", "setup"]


@router.get("/roles", response_model=list[CompanyRoleResponse])
def list_tenant_roles(request: Request, db: Session = Depends(get_master_db)):
    tenant_id = request.state.user.get("tenant_id")
    rows = db.execute(
        text("SELECT id, name, label, is_system FROM tenant_roles WHERE tenant_id = :cid ORDER BY is_system DESC, label"),
        {"cid": tenant_id},
    ).mappings().all()
    return [CompanyRoleResponse(**r) for r in rows]


@router.post("/roles", response_model=CompanyRoleResponse, status_code=status.HTTP_201_CREATED)
def create_company_role(payload: CompanyRoleCreate, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    existing = db.execute(
        text("SELECT id FROM tenant_roles WHERE tenant_id = :cid AND name = :name"),
        {"cid": tenant_id, "name": payload.name},
    ).mappings().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name already exists")
    row = db.execute(
        text("INSERT INTO tenant_roles (tenant_id, name, label, is_system) VALUES (:cid, :name, :label, false) RETURNING id, name, label, is_system"),
        {"cid": tenant_id, "name": payload.name, "label": payload.label},
    ).mappings().first()
    db.commit()
    return CompanyRoleResponse(**row)


@router.patch("/roles/{role_name}", response_model=CompanyRoleResponse)
def update_company_role(role_name: str, payload: CompanyRoleUpdate, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    existing = db.execute(
        text("SELECT id, is_system FROM tenant_roles WHERE tenant_id = :cid AND name = :name"),
        {"cid": tenant_id, "name": role_name},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Role not found")
    row = db.execute(
        text("UPDATE tenant_roles SET label = :label WHERE tenant_id = :cid AND name = :name RETURNING id, name, label, is_system"),
        {"cid": tenant_id, "name": role_name, "label": payload.label},
    ).mappings().first()
    db.commit()
    return CompanyRoleResponse(**row)


@router.delete("/roles/{role_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_role(role_name: str, request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    existing = db.execute(
        text("SELECT id, is_system FROM tenant_roles WHERE tenant_id = :cid AND name = :name"),
        {"cid": tenant_id, "name": role_name},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Role not found")
    if existing["is_system"]:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    in_use = db.execute(
        text("SELECT 1 FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.tenant_id = :cid AND ur.role = :name LIMIT 1"),
        {"cid": tenant_id, "name": role_name},
    ).first()
    if in_use:
        raise HTTPException(status_code=400, detail="Role is assigned to one or more users — remove assignments first")
    db.execute(
        text("DELETE FROM tenant_roles WHERE tenant_id = :cid AND name = :name"),
        {"cid": tenant_id, "name": role_name},
    )
    db.commit()


# ── Module Permissions matrix (master DB) ─────────────────────────────────────

@router.get("/module-permissions", response_model=list[ModulePermissionRow])
def get_module_permissions(request: Request, db: Session = Depends(get_master_db)):
    _require_admin(request)
    tenant_id = request.state.user.get("tenant_id")
    # Cross-join company roles × modules, fill permissions from company-specific first, else global default
    rows = db.execute(
        text("""
            SELECT
                cr.name AS role,
                m.module,
                COALESCE(p.can_read,   false) AS can_read,
                COALESCE(p.can_write,  false) AS can_write,
                COALESCE(p.can_delete, false) AS can_delete
            FROM tenant_roles cr
            CROSS JOIN (VALUES ('orders'),('products'),('customers'),('setup')) AS m(module)
            LEFT JOIN LATERAL (
                SELECT can_read, can_write, can_delete
                FROM module_permissions
                WHERE (tenant_id = :cid OR tenant_id IS NULL)
                  AND role = cr.name AND module = m.module
                ORDER BY tenant_id NULLS LAST
                LIMIT 1
            ) p ON true
            WHERE cr.tenant_id = :cid
            ORDER BY cr.is_system DESC, cr.label, m.module
        """),
        {"cid": tenant_id},
    ).mappings().all()
    return [ModulePermissionRow(**r) for r in rows]


@router.put("/module-permissions/{role}/{module}", response_model=ModulePermissionRow)
def update_module_permission(
    role: str,
    module: str,
    payload: ModulePermissionUpdate,
    request: Request,
    db: Session = Depends(get_master_db),
):
    _require_admin(request)
    if module not in APP_MODULES:
        raise HTTPException(status_code=400, detail=f"Invalid module: {module}")
    tenant_id = request.state.user.get("tenant_id")
    valid_role = db.execute(
        text("SELECT 1 FROM tenant_roles WHERE tenant_id = :cid AND name = :name"),
        {"cid": tenant_id, "name": role},
    ).first()
    if not valid_role:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}")
    db.execute(
        text("""
            INSERT INTO module_permissions (tenant_id, role, module, can_read, can_write, can_delete)
            VALUES (:cid, :role, :module, :r, :w, :d)
            ON CONFLICT (tenant_id, role, module) DO UPDATE
              SET can_read   = EXCLUDED.can_read,
                  can_write  = EXCLUDED.can_write,
                  can_delete = EXCLUDED.can_delete
        """),
        {"cid": tenant_id, "role": role, "module": module,
         "r": payload.can_read, "w": payload.can_write, "d": payload.can_delete},
    )
    db.commit()
    return ModulePermissionRow(role=role, module=module,
                               can_read=payload.can_read,
                               can_write=payload.can_write,
                               can_delete=payload.can_delete)
