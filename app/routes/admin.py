from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.driver import Driver
from app.models.ride import Ride
from app.core.security import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin Dashboard"])


def admin_only(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/users")
def get_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    return db.query(User).all()


@router.get("/drivers")
def get_all_drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    return db.query(Driver).all()


@router.get("/drivers/pending")
def get_pending_drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    return db.query(Driver).filter(Driver.verification_status == "pending").all()


@router.get("/rides")
def get_all_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    return db.query(Ride).all()



@router.get("/rides/{status}")
def get_rides_by_status(
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    return db.query(Ride).filter(Ride.status == status).all()


@router.get("/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only)
):
    total_users = db.query(User).count()
    total_drivers = db.query(Driver).count()
    total_rides = db.query(Ride).count()
    pending_drivers = db.query(Driver).filter(Driver.verification_status == "pending").count()
    completed_rides = db.query(Ride).filter(Ride.status == "completed").count()

    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_rides": total_rides,
        "pending_driver_verifications": pending_drivers,
        "completed_rides": completed_rides
    }