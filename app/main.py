import os
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.security import get_current_user, require_admin
from app.mongodb import MONGO_ACTIVE_URL_MASKED, ensure_indexes
from app.routes import admin, admin_ops, auth, drivers, finance, marketplace, payments, rides, trips, tracking
from app.routes import ai_support, ai_agent
from app.config import FRONTEND_BASE_URL, MONGODB_DB


app = FastAPI(title="Transmaa API")
app.include_router(auth.router)
app.include_router(rides.router)
app.include_router(drivers.router)
app.include_router(ai_support.router)
app.include_router(ai_agent.router)
app.include_router(admin.router)
app.include_router(admin_ops.router)
app.include_router(trips.router)
app.include_router(finance.router)
app.include_router(payments.router)
app.include_router(marketplace.router)
app.include_router(tracking.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_BASE_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.on_event("startup")
def startup_event():
    try:
        ensure_indexes()
    except Exception as exc:
        print(f"Mongo index initialization skipped: {exc}")

@app.get("/")
def root():
    return {"message": "Transmaa Backend Running"}

@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "mongo_db": MONGODB_DB,
        "mongo_url": MONGO_ACTIVE_URL_MASKED,
    }


@app.get("/protected")
def protected(current_user: dict = Depends(get_current_user)):
    return {
        "email": current_user.get("email"),
        "role": current_user.get("role")
    }

@app.get("/admin/dashboard")
def admin_dashboard(current_user: dict = Depends(require_admin)):
    return {
        "message": "Welcome Admin",
        "email": current_user.get("email")
    }
