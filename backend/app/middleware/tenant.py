from fastapi import Request
from fastapi.responses import JSONResponse

from app.services.tenant_manager import get_tenant_db


async def tenant_middleware(request: Request, call_next):
    user = getattr(request.state, "user", None)
    tenant_id = user.get("tenant_id") if user else None
    if tenant_id is None:
        return JSONResponse(status_code=400, content={"detail": "Company context missing"})

    try:
        db = get_tenant_db(int(tenant_id))
    except ValueError as exc:
        return JSONResponse(status_code=404, content={"detail": str(exc)})
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Tenant DB connection failed for company %s", tenant_id)
        return JSONResponse(status_code=503, content={"detail": "Service temporarily unavailable"})

    request.state.db = db
    request.state.sub_tenant_ids = user.get("sub_tenant_ids") or [] if user else []
    request.state.sub_tenant_all = user.get("sub_tenant_all", False) if user else False

    try:
        response = await call_next(request)
    finally:
        db.close()

    return response
