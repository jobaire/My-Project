import json
from sqlalchemy import text


def log_change(db, table_name: str, record_id, action: str, actor_email: str,
               old_data=None, new_data=None):
    db.execute(
        text("""
            INSERT INTO audit_log (table_name, record_id, action, actor_email, old_data, new_data)
            VALUES (:table_name, :record_id, :action, :actor_email, :old_data, :new_data)
        """),
        {
            "table_name": table_name,
            "record_id": record_id,
            "action": action,
            "actor_email": actor_email,
            "old_data": json.dumps(old_data) if old_data is not None else None,
            "new_data": json.dumps(new_data) if new_data is not None else None,
        }
    )


def fetch_full_row(db, table_name: str, record_id) -> dict | None:
    """SELECT * for a single row — used by all audit captures so new columns are picked up automatically."""
    result = db.execute(
        text(f"SELECT * FROM {table_name} WHERE id = :id"),
        {"id": record_id},
    ).mappings().first()
    return dict(result) if result else None
