from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.driver import Driver
from app.models.user import User
from app.schemas.driver import DriverCreate, DriverResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/drivers", tags=["Drivers"])


@router.post("/register", response_model=DriverResponse)
def register_driver(
    driver: DriverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can register")

    new_driver = Driver(
        user_id=current_user.id,
        **driver.dict()
    )

    db.add(new_driver)
    db.commit()
    db.refresh(new_driver)

    return new_driver

@router.put("/verify/{driver_id}")
def verify_driver(
    driver_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    # Only admin allowed
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can verify drivers")

    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    driver.verification_status = status
    driver.is_verified = True if status == "approved" else False

    db.commit()
    db.refresh(driver)

    return {
        "message": f"Driver {status} successfully",
        "driver_id": driver.id,
        "verification_status": driver.verification_status
    }