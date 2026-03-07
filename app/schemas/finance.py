from pydantic import BaseModel
from typing import Optional

class FinanceCreate(BaseModel):
    application_type: str
    vehicle_number: Optional[str] = None
    requested_amount: Optional[float] = None


class FinanceResponse(BaseModel):
    id: int
    application_type: str
    vehicle_number: Optional[str]
    requested_amount: Optional[float]
    status: str
    admin_remark: Optional[str]

    class Config:
        from_attributes = True