from app.mongodb import get_next_sequence, payments_collection, serialize_doc, utc_now


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def record_ride_completion_payment(ride: dict) -> dict | None:
    ride_id = ride.get("id")
    if ride_id is None:
        return None

    existing = serialize_doc(
        payments_collection.find_one({"payment_context": "ride", "ride_id": ride_id})
    )
    if existing:
        return existing

    payment_method = str(ride.get("payment_method") or "cash").strip().lower()
    if payment_method not in {"cash", "online"}:
        payment_method = "cash"

    amount = _to_float(ride.get("price"), 0.0)
    if amount < 0:
        amount = 0.0
    currency = str(ride.get("price_currency") or "INR").upper()

    payment_record = {
        "id": get_next_sequence("payments"),
        "payment_context": "ride",
        "invoice_id": None,
        "ride_id": ride_id,
        "user_id": ride.get("passenger_id"),
        "driver_id": ride.get("driver_id"),
        "provider": "cash" if payment_method == "cash" else "simulation",
        "order_id": f"ride_order_{ride_id}",
        "payment_id": f"ride_payment_{ride_id}",
        "signature": None,
        "amount": amount,
        "currency": currency,
        "status": "captured" if payment_method == "online" else "collected",
        "mode": "simulation" if payment_method == "online" else "cash",
        "source": "ride_completion",
        "method": payment_method,
        "created_at": utc_now(),
        "verified_at": utc_now(),
    }
    payments_collection.insert_one(payment_record)
    return payment_record
