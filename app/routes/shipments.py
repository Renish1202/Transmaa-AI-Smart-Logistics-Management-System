from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.shipment import Shipment
from app.models.user import User
from app.core.security import get_current_user
from app.schemas.shipment import ShipmentCreate, ShipmentResponse

router = APIRouter(prefix="/shipments", tags=["Shipments"])


@router.post("/create", response_model=ShipmentResponse)
def create_shipment(
    data: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "user":
        raise HTTPException(status_code=403, detail="Only users can create shipments")

    shipment = Shipment(
        passenger_id=current_user.id,
        pickup_location=data.pickup_location,
        drop_location=data.drop_location,
        weight=data.weight,
    )

    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    return shipment


@router.get("/my", response_model=list[ShipmentResponse])
def my_shipments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "user":
        raise HTTPException(status_code=403, detail="Only users can view their shipments")

    return db.query(Shipment).filter(Shipment.passenger_id == current_user.id).all()


@router.get("/unassigned", response_model=list[ShipmentResponse])
def unassigned_shipments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view unassigned shipments")

    return db.query(Shipment).filter(Shipment.trip_id.is_(None)).all()
