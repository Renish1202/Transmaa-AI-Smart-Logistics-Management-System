from pydantic import BaseModel

class VehicleCreate(BaseModel):
    vehicle_type: str
    vehicle_number: str
    model: str
    price: float


class VehicleResponse(BaseModel):
    id: int
    vehicle_type: str
    vehicle_number: str
    model: str
    price: float
    status: str

    class Config:
        from_attributes = True