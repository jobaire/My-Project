import re

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import MASTER_DB_URL
from app.core.security import hash_password
from app.services.tenant_schema import create_and_init_schema, ensure_tenant_schema


# ── Premium / legacy: dedicated database ──────────────────────────────────────

def _build_database_url(database_name: str) -> str:
    return make_url(MASTER_DB_URL).set(database=database_name).render_as_string(hide_password=False)


def _create_database(database_name: str) -> None:
    engine = create_engine(MASTER_DB_URL, isolation_level="AUTOCOMMIT")
    quoted_database_name = engine.dialect.identifier_preparer.quote(database_name)

    with engine.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
            {"database_name": database_name},
        ).scalar()
        if exists:
            raise ValueError("Database name already exists")

        connection.exec_driver_sql(f"CREATE DATABASE {quoted_database_name}")


def provision_tenant(
    db: Session,
    tenant_name: str,
    database_name: str,
) -> dict:
    """Provision a dedicated database (premium tier). Kept for backward compatibility."""
    existing_company = db.execute(
        text("SELECT id FROM tenants WHERE lower(name) = lower(:name)"),
        {"name": tenant_name},
    ).mappings().first()
    if existing_company:
        raise ValueError("Company name already exists")

    tenant_db_url = _build_database_url(database_name)
    _create_database(database_name)

    tenant_engine = create_engine(tenant_db_url)
    ensure_tenant_schema(tenant_engine)

    company = db.execute(
        text(
            "INSERT INTO tenants (name, db_url, is_active) VALUES (:name, :db_url, true) "
            "RETURNING id, name"
        ),
        {"name": tenant_name, "db_url": database_name},
    ).mappings().first()

    db.commit()

    return {
        "tenant_id": company["id"],
        "tenant_name": company["name"],
        "database_name": database_name,
    }


# ── Standard tier: schema-per-tenant in tenants_db ────────────────────────────

def _slugify_schema(tenant_name: str) -> str:
    """Convert company name to a readable PostgreSQL schema name (max 60 chars)."""
    slug = re.sub(r'[^a-z0-9]+', '_', tenant_name.lower()).strip('_')
    return slug[:60]


def provision_standard_tenant(db: Session, tenant_name: str) -> dict:
    """
    Provision a standard company using schema-per-tenant in tenants_db.
    Schema name is the full slugified company name (e.g. liz_fashion_industry_ltd).
    Rejects duplicate company names with a helpful contact-email message.
    """
    # 1. Check name uniqueness — include contact_email for a helpful error message
    existing = db.execute(
        text("SELECT contact_email FROM tenants WHERE lower(name) = lower(:name)"),
        {"name": tenant_name},
    ).mappings().first()
    if existing:
        contact = existing["contact_email"]
        if contact:
            raise ValueError(
                f"A workspace for this company already exists. "
                f"Contact {contact} to be added to their workspace."
            )
        raise ValueError("A company with this name is already registered.")

    # 2. Generate readable schema name from the full company name
    schema_name = _slugify_schema(tenant_name)

    # 3. Insert company record with schema_name set immediately (db_url NULL for schema companies)
    company = db.execute(
        text(
            "INSERT INTO tenants (name, schema_name, is_active) "
            "VALUES (:name, :schema, true) "
            "RETURNING id, name"
        ),
        {"name": tenant_name, "schema": schema_name},
    ).mappings().first()
    tenant_id = int(company["id"])

    # 4. Create and initialise the schema in tenants_db
    create_and_init_schema(schema_name)

    db.commit()

    return {
        "tenant_id": tenant_id,
        "tenant_name": company["name"],
        "schema_name": schema_name,
    }
