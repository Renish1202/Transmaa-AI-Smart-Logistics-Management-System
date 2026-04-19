from math import asin, cos, radians, sin, sqrt
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException

from app.config import (
    RIDE_GEO_TIMEOUT_SECONDS,
    RIDE_MINIMUM_FARE,
    RIDE_PRICE_PER_KM,
    RIDE_PRICING_CURRENCY,
)
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
GEO_USER_AGENT = "transmaa-logistics-app/1.0"
GEO_ENDPOINT = "https://nominatim.openstreetmap.org/search"


def _parse_lat_lng(location: str) -> Optional[tuple[float, float]]:
    if not location or "," not in location:
        return None

    lat_str, lng_str = [part.strip() for part in location.split(",", 1)]
    try:
        lat = float(lat_str)
        lng = float(lng_str)
    except ValueError:
        return None

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def _geocode_location(location: str) -> Optional[tuple[float, float]]:
    parsed = _parse_lat_lng(location)
    if parsed:
        return parsed

    try:
        response = requests.get(
            GEO_ENDPOINT,
            params={"q": location, "format": "json", "limit": 1},
            headers={"User-Agent": GEO_USER_AGENT},
            timeout=RIDE_GEO_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return None

    if response.status_code >= 400:
        return None

    try:
        payload = response.json()
        if not payload:
            return None
        return float(payload[0]["lat"]), float(payload[0]["lon"])
    except (ValueError, TypeError, KeyError, IndexError):
        return None


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)

    a = sin(d_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(d_lng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return earth_radius_km * c


def _estimate_pricing(pickup_location: str, drop_location: str) -> Optional[dict]:
    pickup_coords = _geocode_location(pickup_location)
    drop_coords = _geocode_location(drop_location)

    if not pickup_coords or not drop_coords:
        return None

    distance_km = round(_haversine_km(*pickup_coords, *drop_coords), 2)
    base_price = distance_km * RIDE_PRICE_PER_KM
    final_price = round(max(base_price, RIDE_MINIMUM_FARE), 2)

    return {
        "distance_km": distance_km,
        "per_km_rate": round(RIDE_PRICE_PER_KM, 2),
        "price": final_price,
        "price_currency": RIDE_PRICING_CURRENCY.upper(),
    }


def _search_location_suggestions(query: str, limit: int = 5) -> list[dict]:
    text = (query or "").strip()
    if len(text) < 2:
        return []

    safe_limit = max(1, min(limit, 8))
    try:
        response = requests.get(
            GEO_ENDPOINT,
            params={"q": text, "format": "json", "addressdetails": 1, "limit": safe_limit},
            headers={"User-Agent": GEO_USER_AGENT},
            timeout=RIDE_GEO_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return []

    if response.status_code >= 400:
        return []

    try:
        payload = response.json()
    except ValueError:
        return []

    suggestions = []
    for item in payload:
        label = str(item.get("display_name") or "").strip()
        lat = item.get("lat")
        lon = item.get("lon")
        if not label or lat is None or lon is None:
            continue

        try:
            lat_value = float(lat)
            lng_value = float(lon)
        except (TypeError, ValueError):
            continue

        suggestions.append(
            {
                "label": label,
                "value": label,
                "short_name": label.split(",")[0].strip(),
                "lat": lat_value,
                "lng": lng_value,
            }
        )

    return suggestions


@router.get("/location-suggestions")
def location_suggestions(
    q: str,
    limit: int = 5,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can search locations")
    return _search_location_suggestions(q, limit)


@router.get("/estimate")
def estimate_ride_price(
    pickup_location: str,
    drop_location: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can estimate ride price")

    pricing = _estimate_pricing(pickup_location, drop_location)
    if not pricing:
        raise HTTPException(
            status_code=400,
            detail="Unable to calculate distance for these locations. Use clear place names or 'lat,lng' format.",
        )

    return pricing


@router.post("/request", response_model=RideResponse)
def request_ride(
    ride: RideCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can request rides")

    pricing = _estimate_pricing(ride.pickup_location, ride.drop_location)
    if not pricing:
        raise HTTPException(
            status_code=400,
            detail="Unable to calculate ride price from pickup and drop location",
        )

    shifting_date = ride.shifting_date.strip()
    shifting_time = ride.shifting_time.strip()
    goods_type = ride.goods_type.strip()
    truck_type = ride.truck_type.strip()
    if not shifting_date or not shifting_time or not goods_type or not truck_type:
        raise HTTPException(
            status_code=400,
            detail="Shifting date, shifting time, goods type, and truck type are required",
        )

    new_ride = {
        "id": get_next_sequence("rides"),
        "passenger_id": current_user["id"],
        "driver_id": None,
        "pickup_location": ride.pickup_location,
        "drop_location": ride.drop_location,
        "load_weight": ride.load_weight,
        "shifting_date": shifting_date,
        "shifting_time": shifting_time,
        "goods_type": goods_type,
        "truck_type": truck_type,
        "distance_km": pricing["distance_km"],
        "per_km_rate": pricing["per_km_rate"],
        "price": pricing["price"],
        "price_currency": pricing["price_currency"],
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
