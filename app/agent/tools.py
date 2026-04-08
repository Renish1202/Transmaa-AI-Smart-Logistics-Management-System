from typing import Any, Dict, Tuple

from langchain_core.tools import tool
from app.mongodb import rides_collection, drivers_collection, get_next_sequence, serialize_doc, serialize_docs, utc_now


class ToolResult(Dict[str, Any]):
    pass


def get_recent_rides_impl(current_user: dict) -> ToolResult:
    role = current_user.get("role")
    user_id = current_user.get("id")

    if role == "user":
        rides = serialize_docs(
            rides_collection.find({"passenger_id": user_id}).sort("id", -1).limit(5)
        )
    elif role == "driver":
        rides = serialize_docs(
            rides_collection.find({"driver_id": user_id}).sort("id", -1).limit(5)
        )
    else:
        rides = serialize_docs(rides_collection.find({}).sort("id", -1).limit(5))

    return {"ok": True, "data": rides}


def get_ride_status_impl(current_user: dict, ride_id: int) -> ToolResult:
    role = current_user.get("role")
    user_id = current_user.get("id")

    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        return {"ok": False, "error": "Ride not found"}

    if role == "user" and ride.get("passenger_id") != user_id:
        return {"ok": False, "error": "Ride not found for this user"}
    if role == "driver" and ride.get("driver_id") != user_id:
        return {"ok": False, "error": "Ride not found for this driver"}

    return {"ok": True, "data": ride}


def get_driver_status_impl(current_user: dict) -> ToolResult:
    if current_user.get("role") != "driver":
        return {"ok": False, "error": "Only drivers can access driver status"}

    driver = serialize_doc(drivers_collection.find_one({"user_id": current_user["id"]}))
    if not driver:
        return {"ok": False, "error": "Driver profile not found"}

    return {
        "ok": True,
        "data": {
            "verification_status": driver.get("verification_status"),
            "vehicle_number": driver.get("vehicle_number"),
        },
    }


def request_ride_impl(current_user: dict, pickup_location: str, drop_location: str, load_weight: float) -> ToolResult:
    if current_user.get("role") != "user":
        return {"ok": False, "error": "Only users can request rides"}

    new_ride = {
        "id": get_next_sequence("rides"),
        "passenger_id": current_user["id"],
        "driver_id": None,
        "pickup_location": pickup_location,
        "drop_location": drop_location,
        "load_weight": float(load_weight),
        "price": None,
        "status": "requested",
        "created_at": utc_now(),
    }

    rides_collection.insert_one(new_ride)
    return {"ok": True, "data": new_ride}


def cancel_ride_impl(current_user: dict, ride_id: int) -> ToolResult:
    ride = serialize_doc(rides_collection.find_one({"id": ride_id}))
    if not ride:
        return {"ok": False, "error": "Ride not found"}

    if current_user.get("role") != "user":
        return {"ok": False, "error": "Only users can cancel rides"}

    if ride.get("passenger_id") != current_user.get("id"):
        return {"ok": False, "error": "Ride not found for this user"}

    if ride.get("status") not in ["requested", "accepted"]:
        return {"ok": False, "error": "Cannot cancel at this stage"}

    rides_collection.update_one({"id": ride_id}, {"$set": {"status": "cancelled"}})
    ride["status"] = "cancelled"
    return {"ok": True, "data": ride}


TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "get_recent_rides": {
        "risk": "safe",
        "description": "Get the most recent rides for the current user/driver/admin.",
        "args": {},
        "handler": lambda user, args: get_recent_rides_impl(user),
    },
    "get_ride_status": {
        "risk": "safe",
        "description": "Get the status of a specific ride by id.",
        "args": {"ride_id": "int"},
        "handler": lambda user, args: get_ride_status_impl(user, int(args.get("ride_id"))),
    },
    "get_driver_status": {
        "risk": "safe",
        "description": "Get driver verification status for the current driver.",
        "args": {},
        "handler": lambda user, args: get_driver_status_impl(user),
    },
    "request_ride": {
        "risk": "risky",
        "description": "Create a new ride request for the current user.",
        "args": {"pickup_location": "string", "drop_location": "string", "load_weight": "number"},
        "handler": lambda user, args: request_ride_impl(
            user,
            str(args.get("pickup_location")),
            str(args.get("drop_location")),
            float(args.get("load_weight")),
        ),
    },
    "cancel_ride": {
        "risk": "risky",
        "description": "Cancel a ride by id if it is still requested/accepted.",
        "args": {"ride_id": "int"},
        "handler": lambda user, args: cancel_ride_impl(user, int(args.get("ride_id"))),
    },
}


@tool
def get_recent_rides() -> str:
    """Schema-only tool. Execution happens server-side. Get recent rides."""
    return "ok"


@tool
def get_ride_status(ride_id: int) -> str:
    """Schema-only tool. Execution happens server-side. Get ride status by id."""
    return "ok"


@tool
def get_driver_status() -> str:
    """Schema-only tool. Execution happens server-side. Get driver verification status."""
    return "ok"


@tool
def request_ride(pickup_location: str, drop_location: str, load_weight: float) -> str:
    """Schema-only tool. Execution happens server-side. Create a ride request."""
    return "ok"


@tool
def cancel_ride(ride_id: int) -> str:
    """Schema-only tool. Execution happens server-side. Cancel a ride."""
    return "ok"


LANGCHAIN_TOOLS = [
    get_recent_rides,
    get_ride_status,
    get_driver_status,
    request_ride,
    cancel_ride,
]


def list_tool_summaries() -> str:
    lines = []
    for name, meta in TOOL_REGISTRY.items():
        args = meta.get("args", {})
        lines.append(f"- {name} | risk={meta['risk']} | args={args}")
    return "\n".join(lines)


def execute_tool(current_user: dict, tool_name: str, args: Dict[str, Any]) -> Tuple[bool, ToolResult]:
    tool = TOOL_REGISTRY.get(tool_name)
    if not tool:
        return False, {"ok": False, "error": "Unknown tool"}

    try:
        result = tool["handler"](current_user, args or {})
        return True, result
    except (TypeError, ValueError):
        return False, {"ok": False, "error": "Invalid tool arguments"}
