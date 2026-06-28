from threading import Lock

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DB_MAX_OVERFLOW, DB_POOL_SIZE, MASTER_DB_URL
from app.db.master import get_master_session
from app.services.tenant_schema import ensure_tenant_schema

# ── Company info cache — one master DB query per company per restart ──────────
_company_info_cache: dict[int, dict] = {}
_info_cache_lock = Lock()

# ── Dedicated-DB path (premium / legacy) ──────────────────────────────────────
_tenant_session_factories: dict[int, sessionmaker] = {}
_tenant_cache_lock = Lock()

# ── Schema-per-tenant path (standard) ─────────────────────────────────────────
# Each schema gets its own small engine. The connect event sets search_path once
# per physical connection so it persists across commits — no per-request DB queries.
_schema_session_factories: dict[str, sessionmaker] = {}
_schema_cache_lock = Lock()


def _build_session_factory(db_url: str) -> sessionmaker:
    """Build a session factory for a dedicated database (premium/legacy)."""
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
    )
    ensure_tenant_schema(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _build_schema_session_factory(schema_name: str) -> sessionmaker:
    """
    Build a session factory for a schema-per-tenant company.
    The search_path is set at the connection level so it persists
    across commits — every query in the session uses the right schema.
    """
    from app.core.config import SHARED_DB_URL
    if not SHARED_DB_URL:
        raise RuntimeError("SHARED_DB_URL is not configured.")

    # Small pool per schema — all pointing at the same tenants_db server.
    # Keep pool_size=1 so idle tenants hold at most 1 connection; max_overflow=2
    # allows short bursts up to 3 concurrent requests per tenant.
    # pool_recycle closes connections idle >30 min to avoid stale handles.
    engine = create_engine(
        SHARED_DB_URL,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=2,
        pool_recycle=1800,
        pool_timeout=10,
    )

    # Capture schema_name in closure so the event handler uses the right schema
    _schema = schema_name

    @event.listens_for(engine, "connect")
    def set_search_path_on_connect(dbapi_conn, _):
        """Set search_path when a new connection is established."""
        cursor = dbapi_conn.cursor()
        cursor.execute(f'SET search_path TO "{_schema}", public')
        cursor.close()

    @event.listens_for(engine, "checkout")
    def set_search_path_on_checkout(dbapi_conn, _conn_record, _conn_proxy):
        """Re-assert search_path every time a connection is checked out from the pool."""
        cursor = dbapi_conn.cursor()
        cursor.execute(f'SET search_path TO "{_schema}", public')
        cursor.close()

    # Run idempotent migrations so new SQL files apply to existing schemas on restart
    ensure_tenant_schema(engine)

    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _get_tenant_db_url(db_url_stored: str) -> str:
    stored = db_url_stored
    try:
        db_name = make_url(stored).database or stored
    except Exception:
        db_name = stored
    return make_url(MASTER_DB_URL).set(database=db_name).render_as_string(hide_password=False)


def _get_tenant_info(tenant_id: int) -> dict:
    """Return {schema_name, db_url}. Cached after first lookup."""
    cached = _company_info_cache.get(tenant_id)
    if cached is not None:
        return cached

    with _info_cache_lock:
        cached = _company_info_cache.get(tenant_id)
        if cached is not None:
            return cached

        master_db = get_master_session()
        try:
            result = master_db.execute(
                text("SELECT db_url, schema_name FROM tenants WHERE id = :id"),
                {"id": tenant_id},
            ).mappings().first()
        finally:
            master_db.close()

        if not result:
            raise ValueError(f"Company {tenant_id} not found")

        info = dict(result)
        _company_info_cache[tenant_id] = info
        return info


# ── Public API ─────────────────────────────────────────────────────────────────

def get_tenant_db(tenant_id: int) -> Session:
    info = _get_tenant_info(tenant_id)

    if info.get("schema_name"):
        # ── Standard tier: schema-per-tenant in tenants_db ──────────────────
        # search_path is set at the connection level — persists across commits
        schema_name = info["schema_name"]
        factory = _schema_session_factories.get(schema_name)
        if factory is None:
            with _schema_cache_lock:
                factory = _schema_session_factories.get(schema_name)
                if factory is None:
                    factory = _build_schema_session_factory(schema_name)
                    _schema_session_factories[schema_name] = factory
        return factory()

    else:
        # ── Premium / legacy: dedicated database ────────────────────────────
        session_factory = _tenant_session_factories.get(tenant_id)
        if session_factory is None:
            with _tenant_cache_lock:
                session_factory = _tenant_session_factories.get(tenant_id)
                if session_factory is None:
                    if not info.get("db_url"):
                        raise ValueError(f"No database configured for company {tenant_id}")
                    db_url = _get_tenant_db_url(info["db_url"])
                    session_factory = _build_session_factory(db_url)
                    _tenant_session_factories[tenant_id] = session_factory
        return session_factory()
