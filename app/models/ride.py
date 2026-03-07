from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base


class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)

    passenger_id = Column(Integer, ForeignKey("users.id"))
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    pickup_location = Column(String, nullable=False)
    drop_location = Column(String, nullable=False)

    load_weight = Column(Float, nullable=False)  # NEW
    price = Column(Float, nullable=True) 

    status = Column(String, default="requested")
    # requested, accepted, started, completed, cancelled

    passenger = relationship("User", foreign_keys=[passenger_id])
    driver = relationship("User", foreign_keys=[driver_id])