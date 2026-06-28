from fastapi import APIRouter, Request
from sqlalchemy import text

router = APIRouter()


@router.get("/stats")
def get_stats(request: Request):
    db = request.state.db

    customers = db.execute(text("SELECT COUNT(*) FROM customers")).scalar()
    products  = db.execute(text("SELECT COUNT(*) FROM products")).scalar()

    recent = db.execute(text("""
        SELECT
            table_name,
            action,
            actor_email,
            changed_at,
            COALESCE(
                new_data->>'name',
                new_data->>'process_name',
                old_data->>'name',
                old_data->>'process_name'
            ) AS record_name
        FROM audit_log
        ORDER BY changed_at DESC
        LIMIT 10
    """)).mappings().all()

    return {
        "customers": customers,
        "products":  products,
        "recent_activity": [dict(r) for r in recent],
    }
