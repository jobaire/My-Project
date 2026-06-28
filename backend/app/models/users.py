from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=True)
    email = Column(String, unique=True, nullable=False)          # User email
    hashed_password = Column(String, nullable=True)              # NULL until invite is accepted
    full_name = Column(String, nullable=True)                    # Optional full name
    role = Column(String, nullable=True)                         # e.g. "admin", "staff"
    department  = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    avatar      = Column(String, nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"))     # Link to tenant/company

    # Relationship to Company
    company = relationship("Company", back_populates="users")
