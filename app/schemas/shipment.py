from pydantic import BaseModel


class ShipmentCreate(BaseModel):
    pickup_location: str
    drop_location: str
    weight: float


class ShipmentResponse(BaseModel):
    id: int
    passenger_id: int
    pickup_location: str
    drop_location: str
    weight: float
    status: str
    trip_id: int | None

    class Config:
        from_attributes = True
