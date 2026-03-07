from pydantic import BaseModel

class DriverCreate(BaseModel):
    dl_number: str
    pan_number: str
    vehicle_number: str
    vehicle_type: str
    capacity_tons: float
    dl_image: str
    rc_image: str
    vehicle_image: str


class DriverResponse(BaseModel):
    id: int
    vehicle_number: str
    vehicle_type: str
    capacity_tons: float
    verification_status: str

    class Config:
        orm_mode = True