from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.marketplace import VehicleListing
from app.schemas.marketplace import VehicleCreate, VehicleResponse
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/marketplace", tags=["Buy & Sell Vehicles"])

@router.post("/list", response_model=VehicleResponse)
def list_vehicle(
    data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can list vehicles")

    listing = VehicleListing(
        seller_id=current_user.id,
        vehicle_type=data.vehicle_type,
        vehicle_number=data.vehicle_number,
        model=data.model,
        price=data.price
    )

    db.add(listing)
    db.commit()
    db.refresh(listing)

    return listing

@router.get("/available")
def available_vehicles(db: Session = Depends(get_db)):

    vehicles = db.query(VehicleListing).filter(
        VehicleListing.status == "approved"
    ).all()

    return vehicles

@router.put("/admin/update/{vehicle_id}")
def update_listing(
    vehicle_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "admin":
        raise HTTPException(status_code=403)

    listing = db.query(VehicleListing).filter(
        VehicleListing.id == vehicle_id
    ).first()

    if not listing:
        raise HTTPException(status_code=404)

    if status not in ["approved", "rejected", "sold"]:
        raise HTTPException(status_code=400)

    listing.status = status
    db.commit()

    return {"message": f"Vehicle {status}"}