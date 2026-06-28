from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DB_MAX_OVERFLOW, DB_POOL_SIZE, MASTER_DB_URL

engine = create_engine(
    MASTER_DB_URL,
    pool_pre_ping=True,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_master_session() -> Session:
    return SessionLocal()


def get_master_db():
    db = get_master_session()
    try:
        yield db
    finally:
        db.close()
