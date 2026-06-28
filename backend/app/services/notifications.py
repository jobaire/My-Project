"""Helper to create in-app notifications for a user inside a tenant DB session."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def notify(
    db: Session,
    user_id: int,
    title: str,
    message: str | None = None,
    type: str = "info",
    link_to: str | None = None,
) -> None:
    db.execute(
        text("""
            INSERT INTO notifications (user_id, title, message, type, link_to)
            VALUES (:uid, :title, :message, :type, :link_to)
        """),
        {"uid": user_id, "title": title, "message": message, "type": type, "link_to": link_to},
    )
