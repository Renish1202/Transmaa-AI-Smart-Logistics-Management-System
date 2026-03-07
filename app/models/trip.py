from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("users.id"))
    pickup_location = Column(String)
    drop_location = Column(String)
    total_capacity = Column(Float)
    used_capacity = Column(Float, default=0)
    status = Column(String, default="open")

    shipments = relationship("Shipment", back_populates="trip")