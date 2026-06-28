import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.core.tokens import create_token
from app.db.master import get_master_db
from app.services.email_service import send_invite, send_invite_async

logger = logging.getLogger(__name__)
from app.schemas.user import (
    ChangePasswordRequest,
    UserCreateRequest,
    UserResponse,
    UserUpdateRequest,
    primary_role,
)

router = APIRouter()

ADMIN_ROLES = {"admin", "super_admin"}


def _current_user(request: Request) -> dict:
    return request.state.user


def _user_roles(user: dict) -> list[str]:
    return user.get("roles") or ([user["role"]] if user.get("role") else [])


def _require_admin_or_above(user: dict) -> None:
    if not any(r in ADMIN_ROLES for r in _user_roles(user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _get_user_or_404(db: Session, user_id: int) -> dict:
    row = db.execute(
        text("SELECT id, email, full_name, role, department, designation, avatar, tenant_id, hashed_password FROM users WHERE id = :id"),
        {"id": user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    d = dict(row)
    d["is_activated"] = d.pop("hashed_password") is not None
    # Fetch roles from user_roles table
    role_rows = db.execute(
        text("SELECT role FROM user_roles WHERE user_id = :uid ORDER BY role"),
        {"uid": user_id},
    ).mappings().all()
    d["roles"] = [r["role"] for r in role_rows]
    if not d["roles"] and d.get("role"):
        d["roles"] = [d["role"]]  # fallback for legacy
    # Fetch sub-company assignments
    sc_rows = db.execute(
        text("SELECT sub_tenant_id FROM user_sub_tenants WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().all()
    d["sub_tenant_ids"] = [r["sub_tenant_id"] for r in sc_rows]
    return d


def _assert_tenant_scope(actor: dict, target_tenant_id: int | None) -> None:
    if "super_admin" in _user_roles(actor):
        return
    if target_tenant_id != actor.get("tenant_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _validate_roles(db: Session, tenant_id: int, roles: list[str]) -> None:
    valid_rows = db.execute(
        text("SELECT name FROM tenant_roles WHERE tenant_id = :cid"),
        {"cid": tenant_id},
    ).mappings().all()
    valid = {r["name"] for r in valid_rows}
    invalid = [r for r in roles if r not in valid]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role(s): {', '.join(invalid)}",
        )


def _sync_roles(db: Session, user_id: int, roles: list[str]) -> None:
    db.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
    for role in roles:
        db.execute(
            text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role) ON CONFLICT DO NOTHING"),
            {"uid": user_id, "role": role},
        )
    # Keep legacy role column in sync with primary role
    p = primary_role(roles)
    db.execute(text("UPDATE users SET role = :role WHERE id = :id"), {"role": p, "id": user_id})


def _sync_sub_tenants(db: Session, user_id: int, sub_tenant_ids: list[int]) -> None:
    db.execute(text("DELETE FROM user_sub_tenants WHERE user_id = :uid"), {"uid": user_id})
    for sc_id in sub_tenant_ids:
        db.execute(
            text("INSERT INTO user_sub_tenants (user_id, sub_tenant_id) VALUES (:uid, :scid) ON CONFLICT DO NOTHING"),
            {"uid": user_id, "scid": sc_id},
        )


# ---------------------------------------------------------------------------
# /users/me  — current user's own profile
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserResponse)
def get_me(request: Request, db: Session = Depends(get_master_db)):
    user = _current_user(request)
    return _get_user_or_404(db, int(user["sub"]))


@router.patch("/me", response_model=UserResponse)
def update_me(payload: UserUpdateRequest, request: Request, db: Session = Depends(get_master_db)):
    user = _current_user(request)
    user_id = int(user["sub"])

    updates: dict = {}
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.email is not None:
        existing = db.execute(
            text("SELECT id FROM users WHERE lower(email) = lower(:email) AND id != :id"),
            {"email": str(payload.email), "id": user_id},
        ).mappings().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        updates["email"] = str(payload.email)
    if payload.department is not None:
        updates["department"] = payload.department
    if payload.designation is not None:
        updates["designation"] = payload.designation
    if payload.avatar is not None:
        updates["avatar"] = payload.avatar

    if updates:
        set_clause = ", ".join(f"{col} = :{col}" for col in updates)
        updates["id"] = user_id
        db.execute(text(f"UPDATE users SET {set_clause} WHERE id = :id"), updates)

    db.commit()
    return _get_user_or_404(db, user_id)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(payload: ChangePasswordRequest, request: Request, db: Session = Depends(get_master_db)):
    user = _current_user(request)
    user_id = int(user["sub"])

    row = db.execute(
        text("SELECT hashed_password FROM users WHERE id = :id"), {"id": user_id}
    ).mappings().first()

    if not row or not verify_password(payload.current_password, row["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    db.execute(
        text("UPDATE users SET hashed_password = :hp WHERE id = :id"),
        {"hp": hash_password(payload.new_password), "id": user_id},
    )
    db.commit()


# ---------------------------------------------------------------------------
# /users/  — admin & super_admin CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[UserResponse])
def list_users(request: Request, tenant_id: int | None = None, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)

    if "super_admin" in _user_roles(actor):
        where = "WHERE tenant_id = :cid" if tenant_id else ""
        params = {"cid": tenant_id} if tenant_id else {}
    else:
        where = "WHERE tenant_id = :cid"
        params = {"cid": actor["tenant_id"]}

    rows = db.execute(
        text(f"SELECT id, email, full_name, role, department, designation, avatar, tenant_id, hashed_password FROM users {where} ORDER BY email"),
        params,
    ).mappings().all()

    result = []
    for row in rows:
        d = dict(row)
        d["is_activated"] = d.pop("hashed_password") is not None
        role_rows = db.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid ORDER BY role"),
            {"uid": d["id"]},
        ).mappings().all()
        d["roles"] = [r["role"] for r in role_rows]
        if not d["roles"] and d.get("role"):
            d["roles"] = [d["role"]]
        sc_rows = db.execute(
            text("SELECT sub_tenant_id FROM user_sub_tenants WHERE user_id = :uid"),
            {"uid": d["id"]},
        ).mappings().all()
        d["sub_tenant_ids"] = [r["sub_tenant_id"] for r in sc_rows]
        result.append(d)
    return result


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest, request: Request, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)

    if "super_admin" in _user_roles(actor):
        if payload.tenant_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tenant_id required for super_admin")
        target_tenant_id = payload.tenant_id
    else:
        target_tenant_id = actor["tenant_id"]

    company = db.execute(
        text("SELECT id FROM tenants WHERE id = :id AND is_active = true"),
        {"id": target_tenant_id},
    ).mappings().first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    existing = db.execute(
        text("SELECT id FROM users WHERE lower(email) = lower(:email)"),
        {"email": str(payload.email)},
    ).mappings().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    roles = payload.roles or ["data_entry"]
    _validate_roles(db, target_tenant_id, roles)
    p = primary_role(roles)

    hashed_pw = hash_password(payload.password) if payload.password else None

    new_user = db.execute(
        text(
            "INSERT INTO users (email, hashed_password, full_name, role, department, designation, tenant_id) "
            "VALUES (:email, :hp, :full_name, :role, :department, :designation, :tenant_id) "
            "RETURNING id"
        ),
        {
            "email": str(payload.email),
            "hp": hashed_pw,
            "full_name": payload.full_name,
            "role": p,
            "department": payload.department,
            "designation": payload.designation,
            "tenant_id": target_tenant_id,
        },
    ).mappings().first()
    user_id = new_user["id"]

    _sync_roles(db, user_id, roles)
    if payload.sub_tenant_ids:
        _sync_sub_tenants(db, user_id, payload.sub_tenant_ids)

    if hashed_pw is None:
        token = create_token(db, user_id, "invite")
        db.commit()
        actor_name = actor.get("full_name") or actor.get("email") or "An administrator"
        try:
            send_invite_async(str(payload.email), token, actor_name)
        except Exception:
            logger.exception("Failed to send invite email to %s", payload.email)
    else:
        db.commit()

    return _get_user_or_404(db, user_id)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, request: Request, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)
    target = _get_user_or_404(db, user_id)
    _assert_tenant_scope(actor, target["tenant_id"])
    return target


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, payload: UserUpdateRequest, request: Request, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)
    target = _get_user_or_404(db, user_id)
    _assert_tenant_scope(actor, target["tenant_id"])

    if int(actor["sub"]) == user_id and payload.roles is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own roles")

    updates: dict = {}
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.email is not None:
        existing = db.execute(
            text("SELECT id FROM users WHERE lower(email) = lower(:email) AND id != :id"),
            {"email": str(payload.email), "id": user_id},
        ).mappings().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        updates["email"] = str(payload.email)
    if payload.department is not None:
        updates["department"] = payload.department
    if payload.designation is not None:
        updates["designation"] = payload.designation

    if updates:
        set_clause = ", ".join(f"{col} = :{col}" for col in updates)
        updates["id"] = user_id
        db.execute(text(f"UPDATE users SET {set_clause} WHERE id = :id"), updates)

    if payload.roles is not None:
        _validate_roles(db, target["tenant_id"], payload.roles)
        _sync_roles(db, user_id, payload.roles)

    if payload.sub_tenant_ids is not None:
        _sync_sub_tenants(db, user_id, payload.sub_tenant_ids)

    db.commit()
    return _get_user_or_404(db, user_id)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, request: Request, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)

    if int(actor["sub"]) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

    target = _get_user_or_404(db, user_id)
    _assert_tenant_scope(actor, target["tenant_id"])

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()


@router.post("/{user_id}/resend-invite", status_code=status.HTTP_204_NO_CONTENT)
def resend_invite(user_id: int, request: Request, db: Session = Depends(get_master_db)):
    actor = _current_user(request)
    _require_admin_or_above(actor)
    target = _get_user_or_404(db, user_id)
    _assert_tenant_scope(actor, target["tenant_id"])

    if target["is_activated"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has already activated their account.",
        )

    token = create_token(db, user_id, "invite")
    db.commit()

    actor_name = actor.get("full_name") or actor.get("email") or "An administrator"
    try:
        send_invite(target["email"], token, actor_name)
    except Exception:
        logger.exception("Failed to resend invite to %s", target["email"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send invite email. Please try again later.",
        )
