from fastapi import APIRouter
from app.services.news_fetcher import get_news_feed

router = APIRouter()


@router.get("/feed")
def news_feed():
    return get_news_feed()
