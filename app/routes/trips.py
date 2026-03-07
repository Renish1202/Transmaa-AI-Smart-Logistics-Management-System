from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.trip import Trip
from app.models.shipment import Shipment
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/trips", tags=["Trips"])


@router.put("/{trip_id}/add-shipment/{shipment_id}")
def add_shipment(
    trip_id: int,
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()

    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Not found")

    if shipment.trip_id:
        raise HTTPException(status_code=400, detail="Already assigned")

    if trip.used_capacity + shipment.weight > trip.total_capacity:
        raise HTTPException(status_code=400, detail="Truck full")

    shipment.trip_id = trip.id
    shipment.status = "assigned"

    trip.used_capacity += shipment.weight

    db.commit()
    db.refresh(trip)

    return {"message": "Shipment added successfully"}