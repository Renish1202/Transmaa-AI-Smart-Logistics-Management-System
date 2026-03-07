from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    passenger_id = Column(Integer, ForeignKey("users.id"))
    pickup_location = Column(String)
    drop_location = Column(String)
    weight = Column(Float)
    status = Column(String, default="pending")

    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)

    trip = relationship("Trip", back_populates="shipments")