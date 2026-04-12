import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user, require_admin, require_driver
from app.mongodb import (
    get_next_sequence,
    rides_collection,
    tracking_collection,
    serialize_doc,
    serialize_docs,
    utc_now,
)

router = APIRouter(prefix="/tracking", tags=["Tracking"])

ACTIVE_STATUSES = {"accepted", "started", "in_transit"}


class Heartbeat(BaseModel):
    ride_id: int
    lat: float
    lng: float
    speed_kmh: Optional[float] = None


def _base_anchor(ride_id: int) -> tuple[float, float]:
    bases = [
        (28.6139, 77.2090),  # Delhi
        (19.0760, 72.8777),  # Mumbai
        (13.0827, 80.2707),  # Chennai
        (22.5726, 88.3639),  # Kolkata
        (12.9716, 77.5946),  # Bengaluru
    ]
    base_lat, base_lng = bases[ride_id % len(bases)]
    rng = random.Random(ride_id)
    return (
        base_lat + rng.uniform(-0.15, 0.15),
        base_lng + rng.uniform(-0.15, 0.15),
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _simulate_update(doc: dict) -> dict:
    anchor_lat = doc.get("anchor_lat")
    anchor_lng = doc.get("anchor_lng")
    if anchor_lat is None or anchor_lng is None:
        anchor_lat, anchor_lng = _base_anchor(doc["ride_id"])

    lat = doc.get("lat", anchor_lat)
    lng = doc.get("lng", anchor_lng)

    rng = random.Random()
    lat += rng.uniform(-0.01, 0.01)
    lng += rng.uniform(-0.01, 0.01)

    lat = _clamp(lat, anchor_lat - 0.2, anchor_lat + 0.2)
    lng = _clamp(lng, anchor_lng - 0.2, anchor_lng + 0.2)

    speed = doc.get("speed_kmh")
    if speed is None:
        speed = rng.uniform(35, 68)

    return {
        "lat": lat,
        "lng": lng,
        "speed_kmh": round(float(speed), 1),
        "updated_at": utc_now(),
        "anchor_lat": anchor_lat,
        "anchor_lng": anchor_lng,
    }


def _tracking_payload(ride: dict, tracking: dict) -> dict:
    return {
        "ride_id": ride.get("id"),
        "load_id": f"LD-{ride.get('id', 0):06d}",
        "driver_id": ride.get("driver_id"),
        "status": ride.get("status"),
        "lat": tracking.get("lat"),
        "lng": tracking.get("lng"),
        "speed_kmh": tracking.get("speed_kmh"),
        "updated_at": tracking.get("updated_at"),
    }


@router.post("/heartbeat")
def heartbeat(payload: Heartbeat, current_user: dict = Depends(require_driver)):
    ride = serialize_doc(rides_collection.find_one({"id": payload.ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("driver_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Not assigned to this ride")

    tracking = serialize_doc(tracking_collection.find_one({"ride_id": payload.ride_id}))
    if not tracking:
        anchor_lat, anchor_lng = _base_anchor(payload.ride_id)
        tracking = {
            "id": get_next_sequence("tracking"),
            "ride_id": payload.ride_id,
            "driver_id": ride.get("driver_id"),
            "lat": payload.lat,
            "lng": payload.lng,
            "speed_kmh": payload.speed_kmh,
            "anchor_lat": anchor_lat,
            "anchor_lng": anchor_lng,
            "created_at": utc_now(),
            "updated_at": utc_now(),
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
                    "updated_at": utc_now(),
                }
            },
        )

    return {"message": "Location updated"}


@router.get("/active")
def active_routes(current_user: dict = Depends(require_admin)):
    rides = serialize_docs(rides_collection.find({"status": {"$in": list(ACTIVE_STATUSES)}}))
    payload = []

    for ride in rides:
        tracking = serialize_doc(tracking_collection.find_one({"ride_id": ride.get("id")}))
        if not tracking:
            anchor_lat, anchor_lng = _base_anchor(ride.get("id", 0))
            seed = {
                "id": get_next_sequence("tracking"),
                "ride_id": ride.get("id"),
                "driver_id": ride.get("driver_id"),
                "lat": anchor_lat,
                "lng": anchor_lng,
                "speed_kmh": None,
                "anchor_lat": anchor_lat,
                "anchor_lng": anchor_lng,
                "created_at": utc_now(),
            }
            tracking_collection.insert_one(seed)
            tracking = seed

        updates = _simulate_update(tracking)
        tracking_collection.update_one({"ride_id": ride.get("id")}, {"$set": updates})
        tracking.update(updates)
        payload.append(_tracking_payload(ride, tracking))

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
    if not tracking:
        return {"status": "no_tracking", "ride_id": ride_id}

    return _tracking_payload(ride, tracking)
