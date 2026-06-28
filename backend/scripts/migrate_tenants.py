"""
Tenant migration runner — applies a SQL statement to every company's tenant data.
Handles both architectures:
  - Schema-per-tenant (standard): connects to tenants_db and sets search_path
  - Dedicated DB (premium/legacy): connects to the company's own database

Usage:
  python scripts/migrate_tenants.py "ALTER TABLE products ADD COLUMN weight DECIMAL(10,2)"

Options:
  --dry-run   Print what would be run without executing
  --company   Run on one company only (by name or ID)
  --file      Read SQL from a file instead of the command line

Examples:
  python scripts/migrate_tenants.py "CREATE INDEX IF NOT EXISTS idx_sku ON products(sku)"
  python scripts/migrate_tenants.py --file migrations/add_weight_column.sql
  python scripts/migrate_tenants.py --company "Apparel Co" "ALTER TABLE ..."
  python scripts/migrate_tenants.py --dry-run "DROP TABLE old_table"
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import MASTER_DB_URL, SHARED_DB_URL


def get_all_companies():
    engine = create_engine(MASTER_DB_URL)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, name, db_url, schema_name FROM tenants WHERE is_active = true ORDER BY name")
        ).mappings().all()
    return [dict(r) for r in rows]


def run_on_company(company: dict, sql: str, dry_run: bool) -> bool:
    name = company["name"]

    if company.get("schema_name"):
        # ── Standard tier: schema-per-tenant in tenants_db ──
        label = f"{name} (schema: {company['schema_name']})"
        print(f"  {'[DRY RUN] Would run on' if dry_run else 'Running on'}: {label}")
        if dry_run:
            return True
        try:
            engine = create_engine(SHARED_DB_URL)
            with engine.begin() as conn:
                conn.execute(text(f"SET LOCAL search_path TO \"{company['schema_name']}\", public"))
                conn.execute(text(sql))
            print("    OK")
            return True
        except Exception as e:
            print(f"    FAILED: {e}")
            return False

    elif company.get("db_url"):
        # ── Premium / legacy: dedicated database ──
        db_name = company["db_url"]
        label = f"{name} (db: {db_name})"
        print(f"  {'[DRY RUN] Would run on' if dry_run else 'Running on'}: {label}")
        if dry_run:
            return True
        try:
            company_url = make_url(MASTER_DB_URL).set(database=db_name).render_as_string(hide_password=False)
            engine = create_engine(company_url)
            with engine.begin() as conn:
                conn.execute(text(sql))
            print("    OK")
            return True
        except Exception as e:
            print(f"    FAILED: {e}")
            return False

    else:
        print(f"  ⚠ SKIPPED: {name} — no db_url or schema_name configured")
        return True


def main():
    parser = argparse.ArgumentParser(description="Run a SQL migration across all tenant data")
    parser.add_argument("sql", nargs="?", help="SQL statement to run")
    parser.add_argument("--file", help="Path to a .sql file")
    parser.add_argument("--dry-run", action="store_true", help="Print what would run without executing")
    parser.add_argument("--company", help="Limit to one company (name or ID)")
    args = parser.parse_args()

    if args.file:
        sql = Path(args.file).read_text(encoding="utf-8").strip()
    elif args.sql:
        sql = args.sql.strip()
    else:
        parser.error("Provide a SQL statement or --file path")

    print(f"\nMigration SQL:\n  {sql[:120]}{'...' if len(sql) > 120 else ''}\n")

    companies = get_all_companies()

    if args.company:
        companies = [
            c for c in companies
            if c["name"].lower() == args.company.lower() or str(c["id"]) == args.company
        ]
        if not companies:
            print(f"No company found matching: {args.company}")
            sys.exit(1)

    # Show counts by tier
    schema_count = sum(1 for c in companies if c.get("schema_name"))
    db_count     = sum(1 for c in companies if c.get("db_url") and not c.get("schema_name"))
    print(f"Targeting {len(companies)} companies ({schema_count} schema-per-tenant, {db_count} dedicated DB):\n")

    ok = fail = 0
    for company in companies:
        success = run_on_company(company, sql, args.dry_run)
        if success:
            ok += 1
        else:
            fail += 1

    print("\n" + "-" * 40)
    print(f"Done: {ok} succeeded, {fail} failed")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
