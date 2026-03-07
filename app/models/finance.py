from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.database import Base

class FinanceApplication(Base):
    __tablename__ = "finance_applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    application_type = Column(String)  
    # truck_loan / vehicle_insurance / load_insurance

    vehicle_number = Column(String, nullable=True)
    requested_amount = Column(Float, nullable=True)

    status = Column(String, default="pending")
    # pending / approved / rejected

    admin_remark = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())