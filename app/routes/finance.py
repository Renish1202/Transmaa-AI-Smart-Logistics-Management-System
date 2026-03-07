from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.finance import FinanceApplication
from app.schemas.finance import FinanceCreate, FinanceResponse
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/finance", tags=["Finance & Insurance"])

@router.post("/apply", response_model=FinanceResponse)
def apply_finance(
    data: FinanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can apply")

    application = FinanceApplication(
        user_id=current_user.id,
        application_type=data.application_type,
        vehicle_number=data.vehicle_number,
        requested_amount=data.requested_amount
    )

    db.add(application)
    db.commit()
    db.refresh(application)

    return application

@router.get("/my-applications")
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    apps = db.query(FinanceApplication).filter(
        FinanceApplication.user_id == current_user.id
    ).all()

    return apps

@router.get("/admin/all")
def all_finance_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "admin":
        raise HTTPException(status_code=403)

    return db.query(FinanceApplication).all()


@router.put("/admin/update/{application_id}")
def update_application(
    application_id: int,
    status: str,
    remark: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "admin":
        raise HTTPException(status_code=403)

    app = db.query(FinanceApplication).filter(
        FinanceApplication.id == application_id
    ).first()

    if not app:
        raise HTTPException(status_code=404)

    if status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400)

    app.status = status
    app.admin_remark = remark

    db.commit()

    return {"message": f"Application {status}"}