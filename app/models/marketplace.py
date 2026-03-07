from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.database import Base

class VehicleListing(Base):
    __tablename__ = "vehicle_listings"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"))

    vehicle_type = Column(String)
    vehicle_number = Column(String)
    model = Column(String)
    price = Column(Float)

    status = Column(String, default="pending")  
    # pending / approved / sold / rejected

    created_at = Column(DateTime(timezone=True), server_default=func.now())