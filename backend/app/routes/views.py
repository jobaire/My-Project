import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.master import get_master_db
from app.schemas.view import ViewCreate, ViewResponse

router = APIRouter()


def _user_id(request: Request) -> int:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return int(user["sub"])


class ViewUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None


@router.get("/{view_key}", response_model=list[ViewResponse])
def list_views(view_key: str, request: Request, db: Session = Depends(get_master_db)):
    uid = _user_id(request)
    rows = db.execute(
        text("SELECT id, view_key, name, config FROM user_views WHERE user_id = :uid AND view_key = :vk ORDER BY id"),
        {"uid": uid, "vk": view_key},
    ).mappings().all()
    return [ViewResponse(**r) for r in rows]


@router.post("/{view_key}", response_model=ViewResponse, status_code=status.HTTP_201_CREATED)
def create_view(view_key: str, payload: ViewCreate, request: Request, db: Session = Depends(get_master_db)):
    uid = _user_id(request)
    row = db.execute(
        text(
            "INSERT INTO user_views (user_id, view_key, name, config) "
            "VALUES (:uid, :vk, :name, CAST(:config AS jsonb)) "
            "RETURNING id, view_key, name, config"
        ),
        {"uid": uid, "vk": view_key, "name": payload.name, "config": json.dumps(payload.config)},
    ).mappings().first()
    db.commit()
    return ViewResponse(**row)


@router.patch("/{view_key}/{view_id}", response_model=ViewResponse)
def update_view(view_key: str, view_id: int, payload: ViewUpdate, request: Request, db: Session = Depends(get_master_db)):
    uid = _user_id(request)
    sets = []
    params = {"id": view_id, "uid": uid, "vk": view_key}
    if payload.name is not None:
        sets.append("name = :name")
        params["name"] = payload.name
    if payload.config is not None:
        sets.append("config = CAST(:config AS jsonb)")
        params["config"] = json.dumps(payload.config)
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.execute(
        text(
            f"UPDATE user_views SET {', '.join(sets)} "
            "WHERE id = :id AND user_id = :uid AND view_key = :vk "
            "RETURNING id, view_key, name, config"
        ),
        params,
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="View not found")
    db.commit()
    return ViewResponse(**row)


@router.delete("/{view_key}/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_view(view_key: str, view_id: int, request: Request, db: Session = Depends(get_master_db)):
    uid = _user_id(request)
    result = db.execute(
        text("DELETE FROM user_views WHERE id = :id AND user_id = :uid AND view_key = :vk RETURNING id"),
        {"id": view_id, "uid": uid, "vk": view_key},
    ).mappings().first()
    if not result:
        raise HTTPException(status_code=404, detail="View not found")
    db.commit()
