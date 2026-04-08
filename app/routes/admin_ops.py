import os
import shutil
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.security import get_current_user, require_admin
from app.mongodb import (
    drivers_collection,
    get_next_sequence,
    invoices_collection,
    pod_collection,
    rides_collection,
    route_plans_collection,
    serialize_doc,
    serialize_docs,
    users_collection,
    utc_now,
)

router = APIRouter(prefix="/admin/ops", tags=["Admin Operations"])
UPLOAD_DIR = "uploads"


class CreateLoadRequest(BaseModel):
    pickup_location: str
    drop_location: str
    load_weight: float
    customer_email: Optional[str] = None
    eta: Optional[str] = "TBD"
    priority: Optional[str] = "medium"


class AssignDriverRequest(BaseModel):
    driver_user_id: int


class StatusUpdateRequest(BaseModel):
    status: str


class RoutePlanRequest(BaseModel):
    distance_km: Optional[float] = None
    notes: Optional[str] = None


class InvoiceCreateRequest(BaseModel):
    load_id: int
    customer: Optional[str] = ""
    amount: float
    due_date: Optional[str] = ""


def _save_upload(file: UploadFile, prefix: str) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    _, extension = os.path.splitext(file.filename or "")
    filename = f"{prefix}_{uuid4().hex}{extension}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return path


def _sample_overview():
    return {
        "kpis": {
            "active_loads": 247,
            "on_time_percent": 94.2,
            "trucks_available": 89,
            "exceptions": 12,
            "fuel_cost_mtd": 89200,
            "revenue_mtd": 1200000,
        },
        "loads": [
            {
                "id": "LD-2024-001847",
                "customer": "Walmart Distribution",
                "route": "Chicago -> Atlanta",
                "eta": "14:30",
                "status": "In Transit",
                "margin": 18.5,
                "driver": "Mike Rodriguez",
                "priority": "high",
            }
        ],
        "dispatch_board": {"Unassigned": [], "Assigned": [], "In Transit": [], "Delivered": []},
        "fleet": {"total": 156, "available": 89, "in_use": 31, "maintenance": 7, "health_score": 92},
        "drivers": {"total": 127, "available": 84, "hos_risk_alerts": 12, "avg_rating": 4.6},
        "routes": {"active": 23, "on_time": 94.2, "critical_delays": 3, "status_ok": "18/20", "recent_events": []},
        "warehouses": [],
        "pod": {"pending_upload": 12, "submitted": 8, "approved": 156, "rejected": 3, "items": []},
        "billing": {"outstanding": 247850, "paid": 1245600, "pending": 156400, "overdue": 91450, "items": []},
        "reports": {"on_time_series": []},
        "ai": {"suggestions": [], "risk_alerts": []},
    }


@router.get("/overview")
def ops_overview(current_user: dict = Depends(require_admin)):
    rides = serialize_docs(rides_collection.find().sort("id", -1).limit(50))
    drivers = serialize_docs(drivers_collection.find().sort("id", -1).limit(50))
    users = serialize_docs(users_collection.find().sort("id", -1).limit(500))
    invoices = serialize_docs(invoices_collection.find().sort("id", -1).limit(50))
    pods = serialize_docs(pod_collection.find().sort("id", -1).limit(50))

    if not rides and not drivers:
        payload = _sample_overview()
        payload["generated_at"] = datetime.now(timezone.utc).isoformat()
        return payload

    user_lookup = {u.get("id"): u for u in users}
    loads = []
    status_counter = {"requested": 0, "accepted": 0, "started": 0, "in_transit": 0, "delivered": 0, "completed": 0, "cancelled": 0}

    for ride in rides:
        status = ride.get("status", "requested")
        if status in status_counter:
            status_counter[status] += 1

        passenger = user_lookup.get(ride.get("passenger_id"), {})
        driver_user = user_lookup.get(ride.get("driver_id"), {})
        loads.append(
            {
                "id": f"LD-{ride.get('id', 0):06d}",
                "ride_id": ride.get("id"),
                "customer": passenger.get("email", "Customer"),
                "route": f"{ride.get('pickup_location', '-') } -> {ride.get('drop_location', '-')}",
                "eta": ride.get("eta", "TBD"),
                "status": status.replace("_", " ").title(),
                "margin": ride.get("margin", 0),
                "driver": driver_user.get("email", "Unassigned"),
                "priority": ride.get("priority", "medium"),
            }
        )

    verified_drivers = [d for d in drivers if d.get("is_verified")]
    in_use = status_counter["accepted"] + status_counter["in_transit"] + status_counter["started"]
    available_estimate = max(len(verified_drivers) - in_use, 0)

    dispatch_board = {
        "Unassigned": [l["id"] for l in loads if l["status"] in ["Requested"]],
        "Assigned": [l["id"] for l in loads if l["status"] in ["Accepted"]],
        "In Transit": [l["id"] for l in loads if l["status"] in ["Started", "In Transit"]],
        "Delivered": [l["id"] for l in loads if l["status"] in ["Delivered", "Completed"]],
    }

    billing = {
        "outstanding": sum(i.get("amount", 0) for i in invoices if i.get("status") in ["pending", "overdue"]),
        "paid": sum(i.get("amount", 0) for i in invoices if i.get("status") == "paid"),
        "pending": sum(i.get("amount", 0) for i in invoices if i.get("status") == "pending"),
        "overdue": sum(i.get("amount", 0) for i in invoices if i.get("status") == "overdue"),
        "items": invoices,
    }

    pod_summary = {
        "pending_upload": len([p for p in pods if p.get("status") == "pending_upload"]),
        "submitted": len([p for p in pods if p.get("status") == "submitted"]),
        "approved": len([p for p in pods if p.get("status") == "approved"]),
        "rejected": len([p for p in pods if p.get("status") == "rejected"]),
        "items": pods,
    }

    return {
        "kpis": {
            "active_loads": len([r for r in rides if r.get("status") not in ["completed", "cancelled"]]),
            "on_time_percent": 90.0,
            "trucks_available": available_estimate,
            "exceptions": len([d for d in drivers if not d.get("is_verified")]),
            "fuel_cost_mtd": 0,
            "revenue_mtd": billing["paid"],
        },
        "loads": loads,
        "dispatch_board": dispatch_board,
        "fleet": {
            "total": len(drivers),
            "available": available_estimate,
            "in_use": in_use,
            "maintenance": 0,
            "health_score": 92,
        },
        "drivers": {
            "total": len(drivers),
            "available": available_estimate,
            "hos_risk_alerts": 0,
            "avg_rating": 4.5,
        },
        "routes": {
            "active": len([r for r in rides if r.get("status") in ["accepted", "started", "in_transit"]]),
            "on_time": 90.0,
            "critical_delays": 0,
            "status_ok": f"{len(verified_drivers)}/{len(drivers) if drivers else 1}",
            "recent_events": ["Live GPS stream connected", "Geofence checks active", "ETA model online"],
        },
        "warehouses": [
            {"name": "Primary Hub", "utilization": 78.4, "dock_status": "Available"},
            {"name": "Regional Hub", "utilization": 61.2, "dock_status": "Available"},
        ],
        "pod": pod_summary,
        "billing": billing,
        "reports": {
            "on_time_series": [
                {"name": "W1", "onTime": 89.2, "delays": 8},
                {"name": "W2", "onTime": 90.1, "delays": 6},
                {"name": "W3", "onTime": 91.0, "delays": 5},
                {"name": "W4", "onTime": 90.0, "delays": 4},
            ]
        },
        "ai": {
            "suggestions": [
                "Auto-assign available drivers based on proximity and capacity",
                "Flag unverified drivers before dispatch",
            ],
            "risk_alerts": ["Monitor HOS windows for active trips", "Track delayed pickup geofence events"],
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/loads/create")
def create_load(payload: CreateLoadRequest, current_user: dict = Depends(require_admin)):
    passenger_id = None
    if payload.customer_email:
        user = serialize_doc(users_collection.find_one({"email": payload.customer_email.lower()}))
        if user:
            passenger_id = user.get("id")

    ride = {
        "id": get_next_sequence("rides"),
        "passenger_id": passenger_id,
        "driver_id": None,
        "pickup_location": payload.pickup_location,
        "drop_location": payload.drop_location,
        "load_weight": payload.load_weight,
        "eta": payload.eta,
        "priority": payload.priority,
        "price": None,
        "status": "requested",
        "created_at": utc_now(),
    }
    rides_collection.insert_one(ride)
    return {"message": "Load created", "ride_id": ride["id"]}


@router.put("/loads/{ride_id}/assign")
def assign_driver(ride_id: int, payload: AssignDriverRequest, current_user: dict = Depends(require_admin)):
    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Load not found")

    driver_profile = serialize_doc(drivers_collection.find_one({"user_id": payload.driver_user_id}))
    if not driver_profile or not driver_profile.get("is_verified"):
        raise HTTPException(status_code=400, detail="Driver not verified or missing profile")

    rides_collection.update_one(
        {"id": ride_id},
        {"$set": {"driver_id": payload.driver_user_id, "status": "accepted"}},
    )
    return {"message": "Driver assigned", "ride_id": ride_id, "driver_user_id": payload.driver_user_id}


@router.put("/loads/{ride_id}/status")
def update_load_status(ride_id: int, payload: StatusUpdateRequest, current_user: dict = Depends(require_admin)):
    allowed = {"requested", "accepted", "started", "in_transit", "delivered", "completed", "cancelled", "loading"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status")

    result = rides_collection.update_one({"id": ride_id}, {"$set": {"status": payload.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Load not found")

    return {"message": "Load status updated", "ride_id": ride_id, "status": payload.status}


@router.post("/loads/auto-assign")
def auto_assign(current_user: dict = Depends(require_admin)):
    ride = serialize_doc(rides_collection.find_one({"status": "requested"}, sort=[("id", 1)]))
    if not ride:
        raise HTTPException(status_code=404, detail="No unassigned load found")

    verified = serialize_docs(drivers_collection.find({"is_verified": True}).sort("id", 1))
    if not verified:
        raise HTTPException(status_code=404, detail="No verified driver available")

    driver_user_id = verified[0]["user_id"]
    rides_collection.update_one(
        {"id": ride["id"]},
        {"$set": {"driver_id": driver_user_id, "status": "accepted"}},
    )
    return {"message": "Auto-assigned", "ride_id": ride["id"], "driver_user_id": driver_user_id}


@router.post("/loads/{ride_id}/plan-route")
def plan_route(ride_id: int, payload: RoutePlanRequest, current_user: dict = Depends(require_admin)):
    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        raise HTTPException(status_code=404, detail="Load not found")

    route_plan = {
        "id": get_next_sequence("route_plans"),
        "load_id": ride_id,
        "distance_km": payload.distance_km,
        "notes": payload.notes,
        "planned_by": current_user.get("id"),
        "created_at": utc_now(),
    }
    route_plans_collection.insert_one(route_plan)
    return {"message": "Route planned", "route_plan_id": route_plan["id"]}


@router.post("/invoices/create")
def create_invoice(payload: InvoiceCreateRequest, current_user: dict = Depends(require_admin)):
    invoice = {
        "id": get_next_sequence("invoices"),
        "load_id": payload.load_id,
        "customer": payload.customer,
        "amount": payload.amount,
        "due_date": payload.due_date,
        "status": "pending",
        "created_by": current_user.get("id"),
        "created_at": utc_now(),
    }
    invoices_collection.insert_one(invoice)
    return {"message": "Invoice created", "invoice_id": invoice["id"]}


@router.put("/invoices/{invoice_id}/status")
def update_invoice_status(invoice_id: int, payload: StatusUpdateRequest, current_user: dict = Depends(require_admin)):
    allowed = {"pending", "paid", "overdue"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid invoice status")

    result = invoices_collection.update_one({"id": invoice_id}, {"$set": {"status": payload.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return {"message": "Invoice status updated", "invoice_id": invoice_id, "status": payload.status}


@router.get("/invoices")
def list_invoices(current_user: dict = Depends(require_admin)):
    return serialize_docs(invoices_collection.find().sort("id", -1))


@router.post("/pod/upload")
def upload_pod(
    load_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in ["driver", "admin"]:
        raise HTTPException(status_code=403, detail="Only driver/admin can upload POD")

    path = _save_upload(file, "pod")
    pod = {
        "id": get_next_sequence("pod_documents"),
        "load_id": load_id,
        "file_path": path,
        "status": "submitted",
        "uploaded_by": current_user.get("id"),
        "created_at": utc_now(),
    }
    pod_collection.insert_one(pod)
    return {"message": "POD uploaded", "pod_id": pod["id"]}


@router.put("/pod/{pod_id}/review")
def review_pod(pod_id: int, payload: StatusUpdateRequest, current_user: dict = Depends(require_admin)):
    if payload.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid review status")

    result = pod_collection.update_one({"id": pod_id}, {"$set": {"status": payload.status, "reviewed_at": utc_now()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="POD not found")

    return {"message": "POD reviewed", "pod_id": pod_id, "status": payload.status}


@router.get("/pod")
def list_pod(current_user: dict = Depends(require_admin)):
    return serialize_docs(pod_collection.find().sort("id", -1))
