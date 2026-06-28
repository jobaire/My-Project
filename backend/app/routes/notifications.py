from fastapi import APIRouter, Request, status
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter()


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str | None = None
    type: str = "info"
    is_read: bool = False
    link_to: str | None = None
    created_at: str


class UnreadCountResponse(BaseModel):
    count: int


@router.get("/", response_model=list[NotificationResponse])
def list_notifications(request: Request, limit: int = 30):
    db = request.state.db
    user_id = int(request.state.user["sub"])
    rows = db.execute(
        text("""
            SELECT id, title, message, type, is_read, link_to, created_at
            FROM notifications
            WHERE user_id = :uid
            ORDER BY created_at DESC
            LIMIT :lim
        """),
        {"uid": user_id, "lim": limit},
    ).mappings().all()
    return [
        NotificationResponse(**{**dict(r), "created_at": r["created_at"].isoformat()})
        for r in rows
    ]


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(request: Request):
    db = request.state.db
    user_id = int(request.state.user["sub"])
    count = db.execute(
        text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = FALSE"),
        {"uid": user_id},
    ).scalar()
    return UnreadCountResponse(count=count or 0)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: int, request: Request):
    db = request.state.db
    user_id = int(request.state.user["sub"])
    db.execute(
        text("UPDATE notifications SET is_read = TRUE WHERE id = :id AND user_id = :uid"),
        {"id": notification_id, "uid": user_id},
    )
    db.commit()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(request: Request):
    db = request.state.db
    user_id = int(request.state.user["sub"])
    db.execute(
        text("UPDATE notifications SET is_read = TRUE WHERE user_id = :uid AND is_read = FALSE"),
        {"uid": user_id},
    )
    db.commit()
