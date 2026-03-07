from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.database import Base

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    dl_number = Column(String, nullable=False)
    pan_number = Column(String, nullable=False)
    vehicle_number = Column(String, nullable=False)
    vehicle_type = Column(String, nullable=False)
    capacity_tons = Column(Float, nullable=False)

    dl_image = Column(String)
    rc_image = Column(String)
    vehicle_image = Column(String)

    is_verified = Column(Boolean, default=False)
    verification_status = Column(String, default="pending")

    created_at = Column(DateTime(timezone=True), server_default=func.now())