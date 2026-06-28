from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.master import get_master_db
from app.schemas.platform import (
    TenantCreateRequest,
    TenantCreateResponse,
    TenantResponse,
    TenantUpdateRequest,
)
from app.services.tenant_provisioning import provision_tenant

router = APIRouter()


def require_super_admin(request: Request) -> None:
    user = getattr(request.state, "user", None)
    if not user or user.get("role") != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )


@router.post(
    "/tenants",
    response_model=TenantCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_company(
    payload: TenantCreateRequest,
    request: Request,
    db: Session = Depends(get_master_db),
):
    require_super_admin(request)

    try:
        company = provision_tenant(
            db=db,
            tenant_name=payload.tenant_name,
            database_name=payload.database_name,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Company database provisioning failed. Check the PostgreSQL user permissions and database settings.",
        ) from exc

    return TenantCreateResponse(**company)


@router.get("/tenants", response_model=list[TenantResponse])
def list_tenants(request: Request, db: Session = Depends(get_master_db)):
    require_super_admin(request)
    rows = db.execute(
        text(
            "SELECT id, name, contact_email, address, phone, is_active "
            "FROM tenants WHERE is_active = true ORDER BY name"
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
def get_company(tenant_id: int, request: Request, db: Session = Depends(get_master_db)):
    require_super_admin(request)
    row = db.execute(
        text(
            "SELECT id, name, contact_email, address, phone, is_active "
            "FROM tenants WHERE id = :id AND is_active = true"
        ),
        {"id": tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return dict(row)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
def update_company(
    tenant_id: int,
    payload: TenantUpdateRequest,
    request: Request,
    db: Session = Depends(get_master_db),
):
    require_super_admin(request)

    row = db.execute(
        text("SELECT id FROM tenants WHERE id = :id AND is_active = true"),
        {"id": tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    updates = {}
    if payload.tenant_name is not None:
        updates["name"] = payload.tenant_name
    if payload.contact_email is not None:
        updates["contact_email"] = str(payload.contact_email)
    if payload.address is not None:
        updates["address"] = payload.address
    if payload.phone is not None:
        updates["phone"] = payload.phone

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_clause = ", ".join(f"{col} = :{col}" for col in updates)
    updates["id"] = tenant_id

    updated = db.execute(
        text(
            f"UPDATE tenants SET {set_clause} "
            "WHERE id = :id RETURNING id, name, contact_email, address, phone, is_active"
        ),
        updates,
    ).mappings().first()
    db.commit()
    return dict(updated)


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_company(
    tenant_id: int,
    request: Request,
    db: Session = Depends(get_master_db),
):
    require_super_admin(request)

    row = db.execute(
        text("SELECT id FROM tenants WHERE id = :id AND is_active = true"),
        {"id": tenant_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    db.execute(
        text("UPDATE tenants SET is_active = false WHERE id = :id"),
        {"id": tenant_id},
    )
    db.commit()
