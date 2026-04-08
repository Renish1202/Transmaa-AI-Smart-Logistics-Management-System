from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.mongodb import (
    drivers_collection,
    rides_collection,
    serialize_doc,
    serialize_docs,
    users_collection,
)

router = APIRouter(prefix="/admin", tags=["Admin Dashboard"])


def admin_only(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/users")
def get_all_users(current_user: dict = Depends(admin_only)):
    users = serialize_docs(users_collection.find())
    for user in users:
        user.pop("password", None)
    return users


@router.get("/drivers")
def get_all_drivers(current_user: dict = Depends(admin_only)):
    return serialize_docs(drivers_collection.find())


@router.get("/drivers/pending")
def get_pending_drivers(current_user: dict = Depends(admin_only)):
    pending_drivers = serialize_docs(drivers_collection.find({"verification_status": "pending"}))
    user_ids = [d.get("user_id") for d in pending_drivers if d.get("user_id") is not None]
    users = serialize_docs(users_collection.find({"id": {"$in": user_ids}})) if user_ids else []
    user_lookup = {u["id"]: u for u in users}

    def to_public_upload_path(path: str | None) -> str | None:
        if not path:
            return None
        normalized = path.replace("\\", "/")
        if normalized.startswith("/uploads/"):
            return normalized
        if normalized.startswith("uploads/"):
            return f"/{normalized}"
        return normalized

    return [
        {
            "id": d.get("id"),
            "user_id": d.get("user_id"),
            "user_email": user_lookup.get(d.get("user_id"), {}).get("email"),
            "user_phone": user_lookup.get(d.get("user_id"), {}).get("phone"),
            "dl_number": d.get("dl_number"),
            "pan_number": d.get("pan_number"),
            "vehicle_number": d.get("vehicle_number"),
            "vehicle_type": d.get("vehicle_type"),
            "capacity_tons": d.get("capacity_tons"),
            "dl_image": to_public_upload_path(d.get("dl_image")),
            "rc_image": to_public_upload_path(d.get("rc_image")),
            "vehicle_image": to_public_upload_path(d.get("vehicle_image")),
            "verification_status": d.get("verification_status"),
            "created_at": d.get("created_at"),
        }
        for d in pending_drivers
    ]


@router.put("/drivers/verify/{driver_id}")
def verify_driver(driver_id: int, status: str, current_user: dict = Depends(admin_only)):
    driver = serialize_doc(drivers_collection.find_one({"id": driver_id}))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    drivers_collection.update_one(
        {"id": driver_id},
        {"$set": {"verification_status": status, "is_verified": status == "approved"}},
    )

    return {
        "message": f"Driver {status} successfully",
        "driver_id": driver_id,
        "verification_status": status,
    }


@router.get("/rides")
def get_all_rides(current_user: dict = Depends(admin_only)):
    return serialize_docs(rides_collection.find())


@router.get("/rides/{status}")
def get_rides_by_status(status: str, current_user: dict = Depends(admin_only)):
    return serialize_docs(rides_collection.find({"status": status}))


@router.get("/stats")
def dashboard_stats(current_user: dict = Depends(admin_only)):
    total_users = users_collection.count_documents({})
    total_drivers = drivers_collection.count_documents({})
    total_rides = rides_collection.count_documents({})
    pending_drivers = drivers_collection.count_documents({"verification_status": "pending"})
    completed_rides = rides_collection.count_documents({"status": "completed"})

    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_rides": total_rides,
        "pending_driver_verifications": pending_drivers,
        "completed_rides": completed_rides,
    }
