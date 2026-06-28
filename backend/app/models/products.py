from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class RoutingProcess(Base):
    __tablename__ = "routing_processes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    default_machine_type = Column(String, nullable=True)
    default_skill_type = Column(String, nullable=True)
    default_smv_minutes = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    style_code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    buyer_name = Column(String, nullable=True)
    garment_type = Column(String, nullable=True)
    base_uom = Column(String, nullable=False, default="pcs")
    is_active = Column(Boolean, nullable=False, default=True)

    versions = relationship("ProductVersion", back_populates="product")


class ProductVersion(Base):
    __tablename__ = "product_versions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    version_no = Column(String, nullable=False)
    version_name = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="draft")
    is_default = Column(Boolean, nullable=False, default=False)

    product = relationship("Product", back_populates="versions")
    routing_steps = relationship("ProductVersionRoutingStep", back_populates="product_version")


class ProductVersionRoutingStep(Base):
    __tablename__ = "product_version_routing_steps"

    id = Column(Integer, primary_key=True, index=True)
    product_version_id = Column(Integer, ForeignKey("product_versions.id"), nullable=False)
    routing_process_id = Column(Integer, ForeignKey("routing_processes.id"), nullable=False)
    sequence_no = Column(Integer, nullable=False)
    work_content = Column(Text, nullable=False)
    machine_type = Column(String, nullable=True)
    skill_type = Column(String, nullable=True)
    smv_minutes = Column(Float, nullable=True)

    product_version = relationship("ProductVersion", back_populates="routing_steps")
    routing_process = relationship("RoutingProcess")
