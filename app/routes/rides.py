from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ride import Ride
from app.models.user import User
from app.schemas.ride import RideCreate, RideResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/rides", tags=["Rides"])

@router.post("/request", response_model=RideResponse)
def request_ride(
    ride: RideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "user":
        raise HTTPException(status_code=403, detail="Only users can request rides")

    new_ride = Ride(
        passenger_id=current_user.id,
        pickup_location=ride.pickup_location,
        drop_location=ride.drop_location,
        load_weight=ride.load_weight
    )

    db.add(new_ride)
    db.commit()
    db.refresh(new_ride)

    return new_ride

@router.get("/pending", response_model=list[RideResponse])
def get_available_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # Only drivers can see available rides
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view rides")

    rides = db.query(Ride).filter(Ride.status == "requested").all()

    return rides

@router.put("/accept/{ride_id}", response_model=RideResponse)
def accept_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # Only drivers allowed
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can accept rides")

    # Get driver profile
    from app.models.driver import Driver
    driver = db.query(Driver).filter(Driver.user_id == current_user.id).first()

    if not driver:
        raise HTTPException(status_code=400, detail="Driver profile not found")

    if driver.verification_status != "approved":
        raise HTTPException(status_code=403, detail="Driver not verified")

    # Get ride
    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.status != "requested":
        raise HTTPException(status_code=400, detail="Ride already taken")

    # 🚛 CAPACITY VALIDATION
    if ride.load_weight > driver.capacity_tons:
        raise HTTPException(
            status_code=400,
            detail="Load exceeds truck capacity"
        )

    # Accept ride
    ride.driver_id = current_user.id
    ride.status = "accepted"

    db.commit()
    db.refresh(ride)

    return ride


@router.put("/start/{ride_id}")
def start_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only driver can start ride")

    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your ride")

    if ride.status != "accepted":
        raise HTTPException(status_code=400, detail="Ride must be accepted first")

    ride.status = "started"

    db.commit()
    return {"message": "Ride started"}


@router.put("/in-transit/{ride_id}")
def in_transit(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403)

    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if ride.status != "started":
        raise HTTPException(status_code=400, detail="Ride must be started first")

    ride.status = "in_transit"

    db.commit()
    return {"message": "Ride is now in transit"}


@router.put("/deliver/{ride_id}")
def deliver_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403)

    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if ride.status != "in_transit":
        raise HTTPException(status_code=400, detail="Ride not in transit")

    ride.status = "delivered"

    db.commit()
    return {"message": "Ride delivered"}


@router.put("/complete/{ride_id}")
def complete_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role not in ["admin", "driver"]:
        raise HTTPException(status_code=403)

    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if ride.status != "delivered":
        raise HTTPException(status_code=400, detail="Ride not delivered yet")

    ride.status = "completed"

    db.commit()
    return {"message": "Ride completed successfully"}

@router.put("/cancel/{ride_id}")
def cancel_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    ride = db.query(Ride).filter(Ride.id == ride_id).first()

    if ride.status not in ["requested", "accepted"]:
        raise HTTPException(status_code=400, detail="Cannot cancel at this stage")

    ride.status = "cancelled"

    db.commit()
    return {"message": "Ride cancelled"}