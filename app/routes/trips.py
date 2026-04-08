from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.mongodb import serialize_doc, shipments_collection, trips_collection

router = APIRouter(prefix="/trips", tags=["Trips"])


@router.put("/{trip_id}/add-shipment/{shipment_id}")
def add_shipment(
    trip_id: int,
    shipment_id: int,
    current_user: dict = Depends(get_current_user),
):
    trip = serialize_doc(trips_collection.find_one({"id": trip_id}))
    shipment = serialize_doc(shipments_collection.find_one({"id": shipment_id}))

    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Not found")

    if shipment.get("trip_id"):
        raise HTTPException(status_code=400, detail="Already assigned")

    if trip.get("used_capacity", 0) + shipment.get("weight", 0) > trip.get("total_capacity", 0):
        raise HTTPException(status_code=400, detail="Truck full")

    shipments_collection.update_one(
        {"id": shipment_id},
        {"$set": {"trip_id": trip_id, "status": "assigned"}},
    )

    trips_collection.update_one(
        {"id": trip_id},
        {"$inc": {"used_capacity": shipment.get("weight", 0)}},
    )

    return {"message": "Shipment added successfully"}
