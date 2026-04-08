from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.mongodb import finance_collection, get_next_sequence, serialize_doc, serialize_docs, utc_now
from app.schemas.finance import FinanceCreate, FinanceResponse

router = APIRouter(prefix="/finance", tags=["Finance & Insurance"])


@router.post("/apply", response_model=FinanceResponse)
def apply_finance(
    data: FinanceCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can apply")

    application = {
        "id": get_next_sequence("finance_applications"),
        "user_id": current_user["id"],
        "application_type": data.application_type,
        "vehicle_number": data.vehicle_number,
        "requested_amount": data.requested_amount,
        "status": "pending",
        "admin_remark": None,
        "created_at": utc_now(),
    }

    finance_collection.insert_one(application)
    return application


@router.get("/my-applications")
def my_applications(
    current_user: dict = Depends(get_current_user),
):
    return serialize_docs(finance_collection.find({"user_id": current_user["id"]}))


@router.get("/admin/all")
def all_finance_applications(
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403)

    return serialize_docs(finance_collection.find())


@router.put("/admin/update/{application_id}")
def update_application(
    application_id: int,
    status: str,
    remark: str = None,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403)

    app = serialize_doc(finance_collection.find_one({"id": application_id}))
    if not app:
        raise HTTPException(status_code=404)

    if status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400)

    finance_collection.update_one(
        {"id": application_id},
        {"$set": {"status": status, "admin_remark": remark}},
    )

    return {"message": f"Application {status}"}
