from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.mongodb import (
    drivers_collection,
    get_next_sequence,
    rides_collection,
    serialize_doc,
    serialize_docs,
    utc_now,
)
from app.schemas.ride import RideCreate, RideResponse

router = APIRouter(prefix="/rides", tags=["Rides"])


@router.post("/request", response_model=RideResponse)
def request_ride(
    ride: RideCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can request rides")

    new_ride = {
        "id": get_next_sequence("rides"),
        "passenger_id": current_user["id"],
        "driver_id": None,
        "pickup_location": ride.pickup_location,
        "drop_location": ride.drop_location,
        "load_weight": ride.load_weight,
        "price": None,
        "status": "requested",
        "created_at": utc_now(),
    }
    rides_collection.insert_one(new_ride)
    return new_ride


@router.get("/pending", response_model=list[RideResponse])
def get_available_rides(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view rides")

    return serialize_docs(rides_collection.find({"status": "requested"}))


@router.put("/accept/{ride_id}", response_model=RideResponse)
def accept_ride(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can accept rides")

    driver = serialize_doc(drivers_collection.find_one({"user_id": current_user["id"]}))
    if not driver:
        raise HTTPException(status_code=400, detail="Driver profile not found")

    if driver.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Driver not verified")

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") != "requested":
        raise HTTPException(status_code=400, detail="Ride already taken")

    if ride["load_weight"] > driver["capacity_tons"]:
        raise HTTPException(status_code=400, detail="Load exceeds truck capacity")

    rides_collection.update_one(
        {"id": ride_id},
        {"$set": {"driver_id": current_user["id"], "status": "accepted"}},
    )
    ride["driver_id"] = current_user["id"]
    ride["status"] = "accepted"
    return ride


@router.put("/start/{ride_id}")
def start_ride(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only driver can start ride")

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("driver_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")

    if ride.get("status") != "accepted":
        raise HTTPException(status_code=400, detail="Ride must be accepted first")

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "started"}})
    return {"message": "Ride started"}


@router.put("/in-transit/{ride_id}")
def in_transit(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403)

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") != "started":
        raise HTTPException(status_code=400, detail="Ride must be started first")

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "in_transit"}})
    return {"message": "Ride is now in transit"}


@router.put("/deliver/{ride_id}")
def deliver_ride(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403)

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") != "in_transit":
        raise HTTPException(status_code=400, detail="Ride not in transit")

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "delivered"}})
    return {"message": "Ride delivered"}


@router.put("/complete/{ride_id}")
def complete_ride(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") not in ["admin", "driver"]:
        raise HTTPException(status_code=403)

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") != "delivered":
        raise HTTPException(status_code=400, detail="Ride not delivered yet")

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "completed"}})
    return {"message": "Ride completed successfully"}


@router.put("/cancel/{ride_id}")
def cancel_ride(
    ride_id: int,
    current_user: dict = Depends(get_current_user)
):
    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") not in ["requested", "accepted"]:
        raise HTTPException(status_code=400, detail="Cannot cancel at this stage")

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "cancelled"}})
    return {"message": "Ride cancelled"}


@router.get("/my")
def my_rides(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can view their rides")
    return serialize_docs(rides_collection.find({"passenger_id": current_user["id"]}).sort("id", -1))


@router.get("/driver/my")
def my_driver_rides(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view their rides")
    return serialize_docs(rides_collection.find({"driver_id": current_user["id"]}).sort("id", -1))
