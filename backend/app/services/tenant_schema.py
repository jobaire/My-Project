from pathlib import Path

from sqlalchemy import Engine, create_engine, text

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"

_TENANT_SQL_FILES = [
    "tenant_product_setup.sql",
    "tenant_style_v2.sql",
    "tenant_orders_setup.sql",
    "tenant_planning_setup.sql",
    "tenant_planning_datetime.sql",
    "tenant_planning_hours.sql",
    "tenant_planning_daily_view.sql",
    "tenant_planning_calendar.sql",
    "tenant_planning_calendar_v2.sql",
    "tenant_planning_settings.sql",
    "tenant_planning_lines_v2.sql",
    "tenant_planning_plan_units.sql",
    "tenant_planning_calendar_breaks.sql",
    "tenant_planning_capacity_v2.sql",
    "tenant_order_lines_style.sql",
    "tenant_planning_segments.sql",
    "tenant_planning_efficiency_reset.sql",
    "tenant_planning_subtotal.sql",
    "tenant_planning_subtotal_dedup.sql",
    "tenant_planning_schedule_v2.sql",
    "tenant_planning_schedule_split.sql",
    "add_performance_indexes.sql",
]


def _run_migrations_raw(dbapi_conn, search_path: str | None = None) -> None:
    """Execute all tenant SQL migration files via the raw DBAPI cursor.

    Bypasses SQLAlchemy's parameter-binding layer so that psycopg2's C extension
    never receives an immutabledict as parameters — it only calls cursor.execute(sql)
    with no second argument.
    """
    cursor = dbapi_conn.cursor()
    try:
        if search_path:
            cursor.execute(f'SET search_path TO "{search_path}", public')
        for filename in _TENANT_SQL_FILES:
            sql = (_MIGRATIONS_DIR / filename).read_text(encoding="utf-8")
            cursor.execute(sql)
        dbapi_conn.commit()
    finally:
        cursor.close()


def ensure_tenant_schema(engine: Engine) -> None:
    """Run all tenant SQL files against a dedicated-DB engine (premium/legacy)."""
    raw_conn = engine.raw_connection()
    try:
        _run_migrations_raw(raw_conn)
    finally:
        raw_conn.close()


def create_and_init_schema(schema_name: str) -> None:
    """Create a new schema in tenants_db and initialise all tenant tables inside it."""
    from app.core.config import SHARED_DB_URL

    if not SHARED_DB_URL:
        raise RuntimeError("SHARED_DB_URL is not configured. Check your .env file.")

    engine = create_engine(SHARED_DB_URL, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))

    engine2 = create_engine(SHARED_DB_URL)
    raw_conn = engine2.raw_connection()
    try:
        _run_migrations_raw(raw_conn, search_path=schema_name)
    finally:
        raw_conn.close()
        engine2.dispose()
