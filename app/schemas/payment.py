from typing import Optional

from pydantic import BaseModel, Field


class PaymentOrderResponse(BaseModel):
    invoice_id: int
    order_id: str
    amount: int
    currency: str
    key_id: Optional[str] = None
    simulate_mode: bool = False


class PaymentVerifyRequest(BaseModel):
    razorpay_payment_id: str = Field(min_length=4)
    razorpay_order_id: str = Field(min_length=4)
    razorpay_signature: str = Field(min_length=8)


class PaymentConfigResponse(BaseModel):
    provider: str
    enabled: bool
    key_id: Optional[str] = None
    simulation_enabled: bool
