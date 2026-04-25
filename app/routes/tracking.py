from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user, require_admin, require_driver
from app.mongodb import (
    drivers_collection,
    get_next_sequence,
    rides_collection,
    tracking_collection,
    serialize_doc,
    serialize_docs,
    utc_now,
)

router = APIRouter(prefix="/tracking", tags=["Tracking"])

ACTIVE_STATUSES = {"accepted", "started", "in_transit", "delivered"}
TRACKING_PATH_LIMIT = 120


class Heartbeat(BaseModel):
    ride_id: int
    lat: float
    lng: float
    speed_kmh: Optional[float] = None
    accuracy_m: Optional[float] = None


def _tracking_payload(ride: dict, tracking: dict, include_path: bool = False) -> dict:
    payload = {
        "ride_id": ride.get("id"),
        "load_id": f"LD-{ride.get('id', 0):06d}",
        "driver_id": ride.get("driver_id"),
        "status": ride.get("status"),
        "pickup_location": ride.get("pickup_location"),
        "drop_location": ride.get("drop_location"),
        "pickup_lat": ride.get("pickup_lat"),
        "pickup_lng": ride.get("pickup_lng"),
        "drop_lat": ride.get("drop_lat"),
        "drop_lng": ride.get("drop_lng"),
        "route_path": ride.get("route_path") or [],
        "distance_km": ride.get("distance_km"),
        "duration_min": ride.get("duration_min"),
        "lat": tracking.get("lat"),
        "lng": tracking.get("lng"),
        "speed_kmh": tracking.get("speed_kmh"),
        "accuracy_m": tracking.get("accuracy_m"),
        "updated_at": tracking.get("updated_at"),
        "tracking_source": tracking.get("source"),
    }
    if include_path:
        payload["path"] = tracking.get("path", [])
    return payload


@router.post("/heartbeat")
def heartbeat(payload: Heartbeat, current_user: dict = Depends(require_driver)):
    ride = serialize_doc(rides_collection.find_one({"id": payload.ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("driver_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Not assigned to this ride")
    if ride.get("status") not in {"started", "in_transit", "delivered"}:
        raise HTTPException(status_code=400, detail="Ride must be started before live tracking")

    captured_at = utc_now()
    path_point = {
        "lat": payload.lat,
        "lng": payload.lng,
        "speed_kmh": payload.speed_kmh,
        "accuracy_m": payload.accuracy_m,
        "recorded_at": captured_at,
    }

    tracking = serialize_doc(tracking_collection.find_one({"ride_id": payload.ride_id}))
    if not tracking:
        tracking = {
            "id": get_next_sequence("tracking"),
            "ride_id": payload.ride_id,
            "driver_id": ride.get("driver_id"),
            "lat": payload.lat,
            "lng": payload.lng,
            "speed_kmh": payload.speed_kmh,
            "accuracy_m": payload.accuracy_m,
            "source": "gps",
            "path": [path_point],
            "created_at": utc_now(),
            "updated_at": captured_at,
        }
        tracking_collection.insert_one(tracking)
    else:
        tracking_collection.update_one(
            {"ride_id": payload.ride_id},
            {
                "$set": {
                    "lat": payload.lat,
                    "lng": payload.lng,
                    "speed_kmh": payload.speed_kmh,
                    "accuracy_m": payload.accuracy_m,
                    "source": "gps",
                    "updated_at": captured_at,
                },
                "$push": {
                    "path": {
                        "$each": [path_point],
                        "$slice": -TRACKING_PATH_LIMIT,
                    }
                },
            },
        )

    return {"message": "Location updated"}


@router.get("/active")
def active_routes(current_user: dict = Depends(require_admin)):
    rides = serialize_docs(rides_collection.find({"status": {"$in": list(ACTIVE_STATUSES)}}))
    driver_user_ids = {
        ride.get("driver_id")
        for ride in rides
        if isinstance(ride.get("driver_id"), int)
    }
    drivers = (
        serialize_docs(drivers_collection.find({"user_id": {"$in": list(driver_user_ids)}}))
        if driver_user_ids
        else []
    )
    driver_by_user_id = {driver.get("user_id"): driver for driver in drivers}
    payload = []

    for ride in rides:
        tracking = serialize_doc(tracking_collection.find_one({"ride_id": ride.get("id")}))
        if tracking and tracking.get("source") != "gps":
            tracking = {}
        item = _tracking_payload(ride, tracking or {}, include_path=False)
        driver = driver_by_user_id.get(ride.get("driver_id")) or {}
        item["driver_profile_id"] = driver.get("id")
        item["truck_number"] = driver.get("vehicle_number")
        item["truck_type"] = driver.get("vehicle_type")
        payload.append(item)

    return payload


@router.get("/ride/{ride_id}")
def ride_tracking(ride_id: int, current_user: dict = Depends(get_current_user)):
    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    role = current_user.get("role")
    if role == "user" and ride.get("passenger_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    if role == "driver" and ride.get("driver_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Not allowed")

    tracking = serialize_doc(tracking_collection.find_one({"ride_id": ride_id}))
    if not tracking or tracking.get("source") != "gps":
        return {"status": "no_tracking", "ride_id": ride_id}

    return _tracking_payload(ride, tracking, include_path=True)
