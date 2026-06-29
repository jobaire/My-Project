import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

logger = logging.getLogger(__name__)
from app.core.config import APP_NAME, FRONTEND_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    from pathlib import Path
    from app.db.master import engine
    sql = (Path(__file__).resolve().parents[1] / "migrations" / "master_init.sql").read_text()
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    yield

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        traces_sample_rate=0.2,
        environment=os.getenv("ENVIRONMENT", "development"),
    )
from app.middleware.auth import auth_middleware
from app.middleware.subscription import subscription_middleware
from app.middleware.tenant import tenant_middleware
from app.routes import audit, auth, customers, dashboard, news, notifications, onboarding, orders, planning, platform, products, setup, users, views

app = FastAPI(title=f"{APP_NAME} Backend", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

PUBLIC_PATHS = {
    "/",
    "/docs",
    "/openapi.json",
    "/favicon.ico",
    "/healthz",
}

TENANT_PATH_PREFIXES = (
    "/customers",
    "/products",
    "/setup",
    "/audit",
    "/dashboard",
    "/orders",
    "/planning",
    "/notifications",
)


def is_public_path(path: str) -> bool:
    return (path in PUBLIC_PATHS
            or path.startswith("/auth")
            or path.startswith("/news")
            or path.startswith("/onboarding"))


def needs_tenant_context(path: str) -> bool:
    return path.startswith(TENANT_PATH_PREFIXES)


@app.get("/")
async def root():
    return JSONResponse(
        {
            "message": f"{APP_NAME} backend is running.",
            "docs": "/docs",
            "login": "/auth/login",
            "health": "/healthz",
        }
    )


@app.get("/healthz")
async def healthcheck():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    # In development, expose the real error so it can be debugged
    detail = f"{type(exc).__name__}: {exc}" if os.getenv("ENVIRONMENT") == "development" else "Internal server error"
    response = JSONResponse(status_code=500, content={"detail": detail, "traceback": traceback.format_exc() if os.getenv("ENVIRONMENT") == "development" else ""})
    # Manually add CORS headers — exception responses bypass CORSMiddleware in Starlette
    origin = request.headers.get("origin", "")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.middleware("http")
async def conditional_tenant_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or not needs_tenant_context(request.url.path):
        return await call_next(request)
    return await tenant_middleware(request, call_next)

@app.middleware("http")
async def conditional_subscription_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or is_public_path(request.url.path):
        return await call_next(request)
    return await subscription_middleware(request, call_next)

@app.middleware("http")
async def conditional_auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or is_public_path(request.url.path):
        return await call_next(request)
    return await auth_middleware(request, call_next)

_cors_kwargs = dict(
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if os.getenv("ENVIRONMENT", "production") == "development":
    _cors_kwargs["allow_origin_regex"] = r"^http://(localhost|127\.0\.0\.1):\d+$"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(auth.router,       prefix="/auth",       tags=["auth"])
app.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(audit.router,     prefix="/audit",     tags=["audit"])
app.include_router(setup.router, prefix="/setup", tags=["setup"])
app.include_router(products.router, prefix="/products", tags=["products"])
app.include_router(customers.router, prefix="/customers", tags=["customers"])
app.include_router(platform.router, prefix="/platform", tags=["platform"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(news.router, prefix="/news", tags=["news"])
app.include_router(views.router, prefix="/views", tags=["views"])
app.include_router(orders.router,        prefix="/orders",        tags=["orders"])
app.include_router(planning.router,      prefix="/planning",      tags=["planning"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
