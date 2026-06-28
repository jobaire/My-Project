"""
Public self-signup endpoint — no authentication required.
Creates the company as a standard (schema-per-tenant) account,
creates the admin user, and starts the trial.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.master import get_master_db
from app.schemas.auth import validate_password_strength
from app.services.tenant_provisioning import provision_standard_tenant
from app.services.email_service import send_welcome_async

router = APIRouter()

TRIAL_DAYS = 14


class SignupRequest(BaseModel):
    tenant_name: str
    admin_name: str
    email: EmailStr
    password: str

    @field_validator("tenant_name")
    @classmethod
    def tenant_name_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Company name must be at least 2 characters.")
        if len(v) > 100:
            raise ValueError("Company name must be under 100 characters.")
        return v

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class SignupResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    message: str


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_master_db)):
    # Check email uniqueness
    existing_user = db.execute(
        text("SELECT id FROM users WHERE lower(email) = lower(:email)"),
        {"email": str(payload.email)},
    ).mappings().first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    # Provision company as standard tier (schema-per-tenant in tenants_db)
    try:
        result = provision_standard_tenant(db, payload.tenant_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    tenant_id = result["tenant_id"]
    trial_ends_at = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)

    # Set trial, contact email, and plan
    db.execute(
        text("UPDATE tenants SET trial_ends_at = :t, contact_email = :e, plan = 'trial' WHERE id = :id"),
        {"t": trial_ends_at, "e": str(payload.email), "id": tenant_id},
    )

    # Create the company admin user
    db.execute(
        text(
            "INSERT INTO users (email, hashed_password, full_name, role, tenant_id) "
            "VALUES (:email, :hp, :name, 'admin', :tenant_id)"
        ),
        {
            "email": str(payload.email),
            "hp": hash_password(payload.password),
            "name": payload.admin_name.strip(),
            "tenant_id": tenant_id,
        },
    )
    db.commit()

    # Send welcome email (fire-and-forget)
    send_welcome_async(str(payload.email), payload.admin_name.strip(), payload.tenant_name, trial_ends_at)

    return SignupResponse(
        tenant_id=tenant_id,
        tenant_name=result["tenant_name"],
        message=f"Account created! You have a {TRIAL_DAYS}-day free trial. Login to get started.",
    )
