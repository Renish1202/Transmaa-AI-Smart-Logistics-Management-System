from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.mongodb import get_next_sequence, marketplace_collection, serialize_doc, serialize_docs, utc_now
from app.schemas.marketplace import VehicleCreate, VehicleResponse

router = APIRouter(prefix="/marketplace", tags=["Buy & Sell Vehicles"])


@router.post("/list", response_model=VehicleResponse)
def list_vehicle(
    data: VehicleCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can list vehicles")

    listing = {
        "id": get_next_sequence("vehicle_listings"),
        "seller_id": current_user["id"],
        "vehicle_type": data.vehicle_type,
        "vehicle_number": data.vehicle_number,
        "model": data.model,
        "price": data.price,
        "status": "pending",
        "created_at": utc_now(),
    }

    marketplace_collection.insert_one(listing)
    return listing


@router.get("/available")
def available_vehicles():
    return serialize_docs(marketplace_collection.find({"status": "approved"}))


@router.put("/admin/update/{vehicle_id}")
def update_listing(
    vehicle_id: int,
    status: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403)

    listing = serialize_doc(marketplace_collection.find_one({"id": vehicle_id}))
    if not listing:
        raise HTTPException(status_code=404)

    if status not in ["approved", "rejected", "sold"]:
        raise HTTPException(status_code=400)

    marketplace_collection.update_one({"id": vehicle_id}, {"$set": {"status": status}})
    return {"message": f"Vehicle {status}"}
