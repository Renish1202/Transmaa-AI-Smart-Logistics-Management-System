from pydantic import BaseModel
from typing import Literal, Optional


class RideCreate(BaseModel):
    pickup_location: str
    drop_location: str
    load_weight: float
    shifting_date: str
    shifting_time: str
    goods_type: str
    truck_type: str
    payment_method: Literal["cash", "online"] = "cash"


class RideResponse(BaseModel):
    id: int
    pickup_location: str
    drop_location: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    drop_lat: Optional[float] = None
    drop_lng: Optional[float] = None
    load_weight: float
    shifting_date: Optional[str] = None
    shifting_time: Optional[str] = None
    goods_type: Optional[str] = None
    truck_type: Optional[str] = None
    payment_method: Optional[str] = None
    distance_km: Optional[float] = None
    duration_min: Optional[float] = None
    distance_source: Optional[str] = None
    route_path: Optional[list[dict[str, float]]] = None
    per_km_rate: Optional[float] = None
    price: Optional[float] = None
    price_currency: Optional[str] = None
    status: str

    class Config:
        from_attributes = True
