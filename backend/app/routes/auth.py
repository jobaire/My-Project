import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.security import (
    consume_refresh_token, create_access_token, create_refresh_token,
    hash_password, revoke_refresh_token, verify_password,
)
from app.core.tokens import consume_token, create_token
from app.db.master import get_master_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    SetPasswordRequest,
)
from app.schemas.user import primary_role
from app.services.email_service import send_password_reset_async

logger = logging.getLogger(__name__)

router = APIRouter()

SUPER_ADMIN_ROLES = {"super_admin", "platform_admin"}


def _compute_perms(perm_rows) -> dict[str, str]:
    """Union permissions across multiple roles — most permissive wins."""
    accumulated: dict[str, dict] = {}
    for r in perm_rows:
        m = r["module"]
        if m not in accumulated:
            accumulated[m] = {"r": False, "w": False, "a": False}
        accumulated[m]["r"] = accumulated[m]["r"] or bool(r["can_read"])
        accumulated[m]["w"] = accumulated[m]["w"] or bool(r["can_write"])
        accumulated[m]["a"] = accumulated[m]["a"] or bool(r["can_delete"])
    result = {}
    for m, flags in accumulated.items():
        s = ("r" if flags["r"] else "") + ("w" if flags["w"] else "") + ("a" if flags["a"] else "")
        result[m] = s if s else "-"
    return result


def _fetch_user_roles(db: Session, user_id: int) -> list[str]:
    rows = db.execute(
        text("SELECT role FROM user_roles WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().all()
    return [r["role"] for r in rows]


def _fetch_perms(db: Session, roles: list[str], tenant_id: int | None) -> dict[str, str]:
    if not roles:
        return {}
    # For each (role, module) pair: prefer company-specific over global default
    perm_rows = db.execute(
        text("""
            SELECT DISTINCT ON (role, module) role, module, can_read, can_write, can_delete
            FROM module_permissions
            WHERE role = ANY(:roles)
              AND tenant_id = :cid
            ORDER BY role, module
        """),
        {"roles": roles, "cid": tenant_id},
    ).mappings().all()
    return _compute_perms(perm_rows)


def _fetch_sub_tenant_ids(db: Session, user_id: int) -> list[int]:
    rows = db.execute(
        text("SELECT sub_tenant_id FROM user_sub_tenants WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().all()
    return [r["sub_tenant_id"] for r in rows]


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_master_db)):
    user = db.execute(
        text("""
            SELECT id, email, full_name, hashed_password, tenant_id, role,
                   department, designation, avatar
            FROM users
            WHERE email = :email
        """),
        {"email": payload.email},
    ).mappings().first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user["hashed_password"] is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not activated. Please check your invite email.",
        )

    if not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Super/platform admins bypass role/permission/sub-company logic
    if user.get("role") in SUPER_ADMIN_ROLES:
        token = create_access_token(
            subject=str(user["id"]),
            tenant_id=None,
            role=user.get("role"),
            email=user["email"],
            roles=[user["role"]],
            perms={},
            sub_tenant_ids=[],
            sub_tenant_all=True,
        )
        refresh = create_refresh_token(db, int(user["id"]))
        db.commit()
        return LoginResponse(
            access_token=token,
            refresh_token=refresh,
            user_id=int(user["id"]),
            tenant_id=None,
            tenant_name=None,
            role=user.get("role"),
            roles=[user["role"]],
            perms={},
            sub_tenant_ids=[],
            sub_tenant_all=True,
            email=user["email"],
            full_name=user.get("full_name"),
            department=user.get("department"),
            designation=user.get("designation"),
            avatar=user.get("avatar"),
        )

    company = db.execute(
        text("SELECT id, name, trial_ends_at, plan FROM tenants WHERE id = :tenant_id"),
        {"tenant_id": user["tenant_id"]},
    ).mappings().first()

    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    user_id = int(user["id"])
    tenant_id = int(company["id"])

    roles = _fetch_user_roles(db, user_id)
    # Fall back to legacy role field if user_roles table is empty for this user
    if not roles and user.get("role"):
        roles = [user["role"]]

    perms = _fetch_perms(db, roles, tenant_id)
    sub_tenant_ids = _fetch_sub_tenant_ids(db, user_id)
    p_role = primary_role(roles)
    is_admin = "admin" in roles

    plan_val = company.get("plan") or "trial"
    trial_iso = company["trial_ends_at"].isoformat() if company.get("trial_ends_at") else None

    token = create_access_token(
        subject=str(user_id),
        tenant_id=tenant_id,
        role=p_role,
        email=user["email"],
        roles=roles,
        perms=perms,
        sub_tenant_ids=sub_tenant_ids,
        sub_tenant_all=is_admin,
        plan=plan_val,
        trial_ends_at=trial_iso,
    )

    refresh = create_refresh_token(db, user_id)
    db.commit()
    return LoginResponse(
        access_token=token,
        refresh_token=refresh,
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_name=company["name"],
        role=p_role,
        roles=roles,
        perms=perms,
        sub_tenant_ids=sub_tenant_ids,
        sub_tenant_all=is_admin,
        email=user["email"],
        full_name=user.get("full_name"),
        department=user.get("department"),
        designation=user.get("designation"),
        avatar=user.get("avatar"),
        trial_ends_at=company["trial_ends_at"].isoformat() if company.get("trial_ends_at") else None,
    )


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_master_db)):
    user = db.execute(
        text("SELECT id, email FROM users WHERE lower(email) = lower(:e)"),
        {"e": str(payload.email)},
    ).mappings().first()

    if not user:
        return  # always 204 — never reveal whether the email exists

    token = create_token(db, int(user["id"]), "reset")
    db.commit()

    try:
        send_password_reset_async(user["email"], token)
    except Exception:
        logger.exception("Failed to send reset email to %s", user["email"])


@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
def set_password(payload: SetPasswordRequest, db: Session = Depends(get_master_db)):
    if payload.purpose not in ("reset", "invite"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid purpose")

    try:
        user_id = consume_token(db, payload.token, payload.purpose)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.execute(
        text("UPDATE users SET hashed_password = :hp WHERE id = :id"),
        {"hp": hash_password(payload.new_password), "id": user_id},
    )
    db.commit()


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_master_db)):
    user_id = consume_refresh_token(db, payload.refresh_token)

    user = db.execute(
        text("SELECT id, email, tenant_id, role FROM users WHERE id = :id"),
        {"id": user_id},
    ).mappings().first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    roles_rows = db.execute(
        text("SELECT role FROM user_roles WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().all()
    roles = [r["role"] for r in roles_rows] or ([user["role"]] if user.get("role") else [])
    p_role = primary_role(roles)

    new_access = create_access_token(
        subject=str(user_id),
        tenant_id=user["tenant_id"],
        role=p_role,
        email=user["email"],
        roles=roles,
    )
    new_refresh = create_refresh_token(db, user_id)
    db.commit()

    return RefreshResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutRequest, db: Session = Depends(get_master_db)):
    revoke_refresh_token(db, payload.refresh_token)
    db.commit()


