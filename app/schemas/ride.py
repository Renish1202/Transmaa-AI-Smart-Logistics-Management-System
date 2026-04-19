from pydantic import BaseModel
from typing import Optional


class RideCreate(BaseModel):
    pickup_location: str
    drop_location: str
    load_weight: float
    shifting_date: str
    shifting_time: str
    goods_type: str
    truck_type: str


class RideResponse(BaseModel):
    id: int
    pickup_location: str
    drop_location: str
    load_weight: float
    shifting_date: Optional[str] = None
    shifting_time: Optional[str] = None
    goods_type: Optional[str] = None
    truck_type: Optional[str] = None
    distance_km: Optional[float] = None
    per_km_rate: Optional[float] = None
    price: Optional[float] = None
    price_currency: Optional[str] = None
    status: str

    class Config:
        from_attributes = True
