from fastapi import FastAPI
from app.database import Base, engine
from app.routes import auth
from app.core.security import get_current_user
from fastapi import Depends
from app.core.security import require_admin
from app.routes import rides, auth, admin
from app.models import driver
from app.routes import drivers
from app.models.trip import Trip
from app.models.shipment import Shipment
from app.routes import trips
from app.routes import finance
from app.routes import marketplace
from fastapi.middleware.cors import CORSMiddleware






from app.models.user import User

app = FastAPI(title="Transmaa API")
app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(drivers.router)
app.include_router(admin.router)
app.include_router(trips.router)
app.include_router(finance.router)
app.include_router(marketplace.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Transmaa Backend Running"}


@app.get("/protected")
def protected(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "role": current_user.role
    }

@app.get("/admin/dashboard")
def admin_dashboard(current_user: User = Depends(require_admin)):
    return {
        "message": "Welcome Admin",
        "email": current_user.email
    }