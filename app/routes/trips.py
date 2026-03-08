from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.trip import Trip
from app.models.shipment import Shipment
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.trip import TripCreate, TripResponse

router = APIRouter(prefix="/trips", tags=["Trips"])


@router.post("/create", response_model=TripResponse)
def create_trip(
    data: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can create trips")

    trip = Trip(
        driver_id=current_user.id,
        pickup_location=data.pickup_location,
        drop_location=data.drop_location,
        total_capacity=data.total_capacity,
    )

    db.add(trip)
    db.commit()
    db.refresh(trip)

    return trip


@router.get("/my", response_model=list[TripResponse])
def my_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view their trips")

    return db.query(Trip).filter(Trip.driver_id == current_user.id).all()


@router.get("/open", response_model=list[TripResponse])
def open_trips(db: Session = Depends(get_db)):
    return db.query(Trip).filter(Trip.status == "open").all()


@router.put("/{trip_id}/add-shipment/{shipment_id}")
def add_shipment(
    trip_id: int,
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()

    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Not found")

    if current_user.role != "driver" or trip.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only trip owner can add shipments")

    if trip.status != "open":
        raise HTTPException(status_code=400, detail="Trip is not open")

    if shipment.trip_id:
        raise HTTPException(status_code=400, detail="Already assigned")

    if trip.used_capacity + shipment.weight > trip.total_capacity:
        raise HTTPException(status_code=400, detail="Truck full")

    shipment.trip_id = trip.id
    shipment.status = "assigned"

    trip.used_capacity += shipment.weight

    db.commit()
    db.refresh(trip)

    return {
        "message": "Shipment added successfully",
        "trip_id": trip.id,
        "used_capacity": trip.used_capacity,
        "remaining_capacity": trip.total_capacity - trip.used_capacity,
    }
