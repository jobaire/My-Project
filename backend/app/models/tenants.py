from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship
from app.models.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, unique=True, nullable=False)
    db_url        = Column(String, nullable=True)
    schema_name   = Column(String, unique=True, nullable=True)
    contact_email = Column(String, nullable=True)
    address       = Column(String, nullable=True)
    phone         = Column(String, nullable=True)
    is_active     = Column(Boolean, nullable=False, default=True)
    plan          = Column(String, nullable=True)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)

    users = relationship("User", back_populates="tenant")
