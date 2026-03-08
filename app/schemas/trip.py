from pydantic import BaseModel


class TripCreate(BaseModel):
    pickup_location: str
    drop_location: str
    total_capacity: float


class TripResponse(BaseModel):
    id: int
    driver_id: int
    pickup_location: str
    drop_location: str
    total_capacity: float
    used_capacity: float
    status: str

    class Config:
        from_attributes = True
