from pydantic import BaseModel


class RideCreate(BaseModel):
    pickup_location: str
    drop_location: str
    load_weight: float


class RideResponse(BaseModel):
    id: int
    pickup_location: str
    drop_location: str
    load_weight: float
    status: str

    class Config:
        from_attributes = True