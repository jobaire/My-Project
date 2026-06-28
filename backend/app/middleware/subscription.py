"""
Subscription/trial middleware.
Reads plan and trial_ends_at from the JWT — zero DB queries per request.
"""
from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse


async def subscription_middleware(request: Request, call_next):
    user = getattr(request.state, "user", None)
    if not user:
        return await call_next(request)

    tenant_id = user.get("tenant_id")
    if not tenant_id:
        return await call_next(request)

    plan = user.get("plan") or "trial"
    trial_ends_at_str = user.get("trial_ends_at")

    if plan == "active":
        return await call_next(request)

    if trial_ends_at_str:
        try:
            expires = datetime.fromisoformat(trial_ends_at_str)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                return JSONResponse(
                    status_code=402,
                    content={
                        "detail": "Your free trial has expired. Please upgrade your plan to continue.",
                        "code": "trial_expired",
                    },
                )
        except (ValueError, TypeError):
            pass  # Malformed date — don't block the request

    return await call_next(request)
