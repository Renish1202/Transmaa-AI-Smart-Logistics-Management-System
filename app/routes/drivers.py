import os
import shutil
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from app.core.security import get_current_user
from app.mongodb import drivers_collection, get_next_sequence, serialize_doc, utc_now

router = APIRouter(prefix="/drivers", tags=["Drivers"])
UPLOAD_DIR = "uploads"


def save_upload(file: UploadFile, prefix: str, user_id: int) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    _, extension = os.path.splitext(file.filename or "")
    filename = f"{prefix}_{user_id}_{uuid4().hex}{extension}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return path

# ---------------- DRIVER REGISTRATION ---------------- #
@router.post("/register")
def register_driver(
    dl_number: str = Form(...),
    pan_number: str = Form(...),
    vehicle_number: str = Form(...),
    vehicle_type: str = Form(...),
    capacity_tons: float = Form(...),
    dl_image: UploadFile = File(...),
    rc_image: UploadFile = File(...),
    vehicle_image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can register")

    existing_driver = drivers_collection.find_one({"user_id": current_user["id"]})
    if existing_driver and existing_driver.get("verification_status") != "rejected":
        raise HTTPException(status_code=400, detail="Driver profile already exists")

    dl_path = save_upload(dl_image, "dl", current_user["id"])
    rc_path = save_upload(rc_image, "rc", current_user["id"])
    vehicle_path = save_upload(vehicle_image, "vehicle", current_user["id"])

    if existing_driver and existing_driver.get("verification_status") == "rejected":
        drivers_collection.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "dl_number": dl_number,
                    "pan_number": pan_number,
                    "vehicle_number": vehicle_number,
                    "vehicle_type": vehicle_type,
                    "capacity_tons": capacity_tons,
                    "dl_image": dl_path,
                    "rc_image": rc_path,
                    "vehicle_image": vehicle_path,
                    "verification_status": "pending",
                    "is_verified": False,
                    "created_at": utc_now(),
                }
            },
        )
        return {
            "message": "Driver re-registration successful. Pending admin verification.",
            "driver_id": existing_driver.get("id"),
        }

    new_driver = {
        "id": get_next_sequence("drivers"),
        "user_id": current_user["id"],
        "dl_number": dl_number,
        "pan_number": pan_number,
        "vehicle_number": vehicle_number,
        "vehicle_type": vehicle_type,
        "capacity_tons": capacity_tons,
        "dl_image": dl_path,
        "rc_image": rc_path,
        "vehicle_image": vehicle_path,
        "verification_status": "pending",
        "is_verified": False,
        "created_at": utc_now(),
    }

    drivers_collection.insert_one(new_driver)

    return {"message": "Driver registration successful. Pending admin verification.", "driver_id": new_driver["id"]}


# ---------------- DRIVER DASHBOARD ACCESS ---------------- #
def verify_driver_access(current_user: dict = Depends(get_current_user)):
    driver = serialize_doc(drivers_collection.find_one({"user_id": current_user["id"]}))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not registered")
    if not driver.get("is_verified"):
        raise HTTPException(status_code=403, detail="Driver not verified")
    return driver

@router.get("/dashboard")
def driver_dashboard(driver: dict = Depends(verify_driver_access)):
    return {
        "message": "Welcome to your dashboard",
        "driver_id": driver["id"],
        "vehicle_number": driver["vehicle_number"],
        "verification_status": driver["verification_status"]
    }


@router.get("/me")
def driver_profile(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can access this endpoint")

    driver = serialize_doc(drivers_collection.find_one({"user_id": current_user["id"]}))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return driver
