from math import asin, cos, radians, sin, sqrt
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException

from app.config import (
    RIDE_GEO_TIMEOUT_SECONDS,
    RIDE_MINIMUM_FARE,
    RIDE_PRICE_PER_KM,
    RIDE_PRICING_CURRENCY,
    RIDE_ROUTING_ENDPOINT,
    RIDE_ROUTE_TIMEOUT_SECONDS,
)
from app.core.security import get_current_user
from app.mongodb import (
    drivers_collection,
    get_next_sequence,
    payments_collection,
    rides_collection,
    serialize_doc,
    serialize_docs,
    users_collection,
    utc_now,
)
from app.schemas.ride import RideCreate, RideResponse
from app.services.ride_payments import record_ride_completion_payment

router = APIRouter(prefix="/rides", tags=["Rides"])
GEO_USER_AGENT = "transmaa-logistics-app/1.0"
GEO_ENDPOINT = "https://nominatim.openstreetmap.org/search"
ROUTE_GEOMETRY_LIMIT = 500


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


def _normalize_route_path(coordinates: list) -> list[dict]:
    points = []
    for raw_point in coordinates:
        if not isinstance(raw_point, (list, tuple)) or len(raw_point) < 2:
            continue
        lng = raw_point[0]
        lat = raw_point[1]
        try:
            lat_value = float(lat)
            lng_value = float(lng)
        except (TypeError, ValueError):
            continue
        if not (-90 <= lat_value <= 90 and -180 <= lng_value <= 180):
            continue
        points.append({"lat": round(lat_value, 6), "lng": round(lng_value, 6)})

    if len(points) <= ROUTE_GEOMETRY_LIMIT:
        return points

    step = max(1, len(points) // ROUTE_GEOMETRY_LIMIT)
    compact = points[::step]
    if compact[-1] != points[-1]:
        compact.append(points[-1])
    return compact


def _fetch_road_route(pickup_coords: tuple[float, float], drop_coords: tuple[float, float]) -> Optional[dict]:
    if not RIDE_ROUTING_ENDPOINT:
        return None

    pickup_lat, pickup_lng = pickup_coords
    drop_lat, drop_lng = drop_coords
    route_url = (
        f"{RIDE_ROUTING_ENDPOINT.rstrip('/')}/"
        f"{pickup_lng},{pickup_lat};{drop_lng},{drop_lat}"
    )

    try:
        response = requests.get(
            route_url,
            params={
                "overview": "full",
                "geometries": "geojson",
                "alternatives": "false",
                "steps": "false",
            },
            headers={"User-Agent": GEO_USER_AGENT},
            timeout=RIDE_ROUTE_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return None

    if response.status_code >= 400:
        return None

    try:
        payload = response.json()
        routes = payload.get("routes") or []
        if not routes:
            return None
        route = routes[0]
        distance_km = round(float(route.get("distance", 0)) / 1000, 2)
        duration_min = round(float(route.get("duration", 0)) / 60, 1)
        geometry = route.get("geometry") if isinstance(route, dict) else {}
        coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else []
        route_path = _normalize_route_path(coordinates if isinstance(coordinates, list) else [])
        if distance_km <= 0:
            return None
        return {
            "distance_km": distance_km,
            "duration_min": duration_min,
            "route_path": route_path,
            "distance_source": "road_route",
        }
    except (ValueError, TypeError, KeyError):
        return None


def _estimate_pricing(pickup_location: str, drop_location: str) -> Optional[dict]:
    pickup_coords = _geocode_location(pickup_location)
    drop_coords = _geocode_location(drop_location)

    if not pickup_coords or not drop_coords:
        return None

    routing = _fetch_road_route(pickup_coords, drop_coords)
    if routing:
        distance_km = routing["distance_km"]
        duration_min = routing["duration_min"]
        route_path = routing["route_path"]
        distance_source = routing["distance_source"]
    else:
        distance_km = round(_haversine_km(*pickup_coords, *drop_coords), 2)
        duration_min = None
        route_path = []
        distance_source = "haversine_fallback"

    base_price = distance_km * RIDE_PRICE_PER_KM
    final_price = round(max(base_price, RIDE_MINIMUM_FARE), 2)

    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "distance_source": distance_source,
        "route_path": route_path,
        "per_km_rate": round(RIDE_PRICE_PER_KM, 2),
        "price": final_price,
        "price_currency": RIDE_PRICING_CURRENCY.upper(),
        "pickup_lat": round(pickup_coords[0], 6),
        "pickup_lng": round(pickup_coords[1], 6),
        "drop_lat": round(drop_coords[0], 6),
        "drop_lng": round(drop_coords[1], 6),
    }


def _ensure_ride_coordinates(ride: dict) -> dict:
    if not ride:
        return ride

    pickup_lat = ride.get("pickup_lat")
    pickup_lng = ride.get("pickup_lng")
    drop_lat = ride.get("drop_lat")
    drop_lng = ride.get("drop_lng")

    has_pickup_coords = isinstance(pickup_lat, (int, float)) and isinstance(pickup_lng, (int, float))
    has_drop_coords = isinstance(drop_lat, (int, float)) and isinstance(drop_lng, (int, float))
    existing_route_path = ride.get("route_path")
    has_route_path = isinstance(existing_route_path, list) and len(existing_route_path) > 1

    updates = {}

    if not has_pickup_coords:
        pickup_coords = _geocode_location(str(ride.get("pickup_location") or ""))
        if pickup_coords:
            updates["pickup_lat"] = round(pickup_coords[0], 6)
            updates["pickup_lng"] = round(pickup_coords[1], 6)

    if not has_drop_coords:
        drop_coords = _geocode_location(str(ride.get("drop_location") or ""))
        if drop_coords:
            updates["drop_lat"] = round(drop_coords[0], 6)
            updates["drop_lng"] = round(drop_coords[1], 6)

    resolved_pickup_lat = updates.get("pickup_lat", pickup_lat)
    resolved_pickup_lng = updates.get("pickup_lng", pickup_lng)
    resolved_drop_lat = updates.get("drop_lat", drop_lat)
    resolved_drop_lng = updates.get("drop_lng", drop_lng)
    resolved_pickup = (
        isinstance(resolved_pickup_lat, (int, float)) and isinstance(resolved_pickup_lng, (int, float))
    )
    resolved_drop = isinstance(resolved_drop_lat, (int, float)) and isinstance(resolved_drop_lng, (int, float))

    if resolved_pickup and resolved_drop and not has_route_path:
        routing = _fetch_road_route(
            (float(resolved_pickup_lat), float(resolved_pickup_lng)),
            (float(resolved_drop_lat), float(resolved_drop_lng)),
        )
        if routing and routing.get("route_path"):
            updates["route_path"] = routing["route_path"]
            updates["duration_min"] = routing["duration_min"]
            updates["distance_source"] = routing["distance_source"]
            if not isinstance(ride.get("distance_km"), (int, float)):
                updates["distance_km"] = routing["distance_km"]

    if updates:
        rides_collection.update_one({"id": ride.get("id")}, {"$set": updates})
        ride.update(updates)

    return ride


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
    payment_method = ride.payment_method.strip().lower()
    if not shifting_date or not shifting_time or not goods_type or not truck_type:
        raise HTTPException(
            status_code=400,
            detail="Shifting date, shifting time, goods type, and truck type are required",
        )
    if payment_method not in {"cash", "online"}:
        raise HTTPException(status_code=400, detail="Payment method must be cash or online")

    new_ride = {
        "id": get_next_sequence("rides"),
        "passenger_id": current_user["id"],
        "driver_id": None,
        "pickup_location": ride.pickup_location,
        "drop_location": ride.drop_location,
        "pickup_lat": pricing["pickup_lat"],
        "pickup_lng": pricing["pickup_lng"],
        "drop_lat": pricing["drop_lat"],
        "drop_lng": pricing["drop_lng"],
        "load_weight": ride.load_weight,
        "shifting_date": shifting_date,
        "shifting_time": shifting_time,
        "goods_type": goods_type,
        "truck_type": truck_type,
        "payment_method": payment_method,
        "distance_km": pricing["distance_km"],
        "duration_min": pricing["duration_min"],
        "distance_source": pricing["distance_source"],
        "route_path": pricing["route_path"],
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

    rides = serialize_docs(rides_collection.find({"status": "requested"}))
    return [_ensure_ride_coordinates(ride) for ride in rides]


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
    ride["status"] = "completed"
    record_ride_completion_payment(ride)
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
    rides = serialize_docs(rides_collection.find({"passenger_id": current_user["id"]}).sort("id", -1))
    return [_ensure_ride_coordinates(ride) for ride in rides]


@router.get("/driver/my")
def my_driver_rides(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view their rides")
    rides = serialize_docs(rides_collection.find({"driver_id": current_user["id"]}).sort("id", -1))
    return [_ensure_ride_coordinates(ride) for ride in rides]


@router.get("/admin/history")
def admin_ride_history(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view ride history")

    rides = serialize_docs(rides_collection.find().sort("id", -1))
    if not rides:
        return []

    user_ids = set()
    for ride in rides:
        passenger_id = ride.get("passenger_id")
        driver_id = ride.get("driver_id")
        if passenger_id is not None:
            user_ids.add(passenger_id)
        if driver_id is not None:
            user_ids.add(driver_id)

    users = serialize_docs(users_collection.find({"id": {"$in": list(user_ids)}})) if user_ids else []
    user_email_map = {user.get("id"): user.get("email") for user in users}

    ride_payments = serialize_docs(
        payments_collection.find({"payment_context": "ride", "ride_id": {"$in": [ride.get("id") for ride in rides]}})
    )
    payment_by_ride = {payment.get("ride_id"): payment for payment in ride_payments}

    enriched = []
    for ride in rides:
        ride_copy = dict(ride)
        ride_copy["passenger_email"] = user_email_map.get(ride.get("passenger_id"))
        ride_copy["driver_email"] = user_email_map.get(ride.get("driver_id"))
        payment = payment_by_ride.get(ride.get("id"))
        ride_copy["payment_status"] = payment.get("status") if payment else "pending"
        ride_copy["payment_mode"] = payment.get("method") if payment else (ride_copy.get("payment_method") or "cash")
        ride_copy["payment_record_id"] = payment.get("id") if payment else None
        enriched.append(ride_copy)

    return enriched
