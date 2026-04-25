import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

from pymongo import ASCENDING, MongoClient, ReturnDocument

from app.config import MONGODB_DB, MONGODB_URL

MONGO_ACTIVE_URL_MASKED = "<not-connected>"


def _mask_mongo_url(raw_url: str) -> str:
    if not raw_url:
        return "<empty>"
    try:
        parsed = urlsplit(raw_url)
    except ValueError:
        return "<invalid-url>"

    netloc = parsed.netloc
    if "@" in netloc:
        netloc = f"***@{netloc.split('@', 1)[1]}"
    return f"{parsed.scheme}://{netloc}{parsed.path}"


def _build_mongo_client() -> MongoClient:
    global MONGO_ACTIVE_URL_MASKED
    fallback_url = os.getenv("MONGODB_FALLBACK_URL", "mongodb://127.0.0.1:27017").strip()
    timeout_ms = int(os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "5000"))
    candidates = [MONGODB_URL]
    if MONGODB_URL.strip().startswith("mongodb+srv://") and fallback_url and fallback_url not in candidates:
        candidates.append(fallback_url)

    last_error = None
    for candidate in candidates:
        try:
            client = MongoClient(candidate, serverSelectionTimeoutMS=timeout_ms)
            MONGO_ACTIVE_URL_MASKED = _mask_mongo_url(candidate)
            print(f"Mongo init success using {MONGO_ACTIVE_URL_MASKED}")
            return client
        except Exception as exc:
            last_error = exc
            print(
                "Mongo init failed for "
                f"{_mask_mongo_url(candidate)}; trying next candidate if available. Error: {exc}"
            )

    raise RuntimeError(f"Unable to initialize Mongo client: {last_error}")


mongo_client = _build_mongo_client()
mongo_db = mongo_client[MONGODB_DB]

users_collection = mongo_db["users"]
drivers_collection = mongo_db["drivers"]
rides_collection = mongo_db["rides"]
trips_collection = mongo_db["trips"]
shipments_collection = mongo_db["shipments"]
finance_collection = mongo_db["finance_applications"]
marketplace_collection = mongo_db["vehicle_listings"]
invoices_collection = mongo_db["invoices"]
payments_collection = mongo_db["payments"]
pod_collection = mongo_db["pod_documents"]
route_plans_collection = mongo_db["route_plans"]
tracking_collection = mongo_db["tracking"]
counters_collection = mongo_db["counters"]


def utc_now():
    return datetime.now(timezone.utc)


def get_next_sequence(name: str) -> int:
    counter = counters_collection.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(counter["seq"])


def serialize_doc(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    data = dict(doc)
    data.pop("_id", None)
    return data


def serialize_docs(docs):
    return [serialize_doc(doc) for doc in docs]


def ensure_indexes():
    users_collection.create_index([("email", ASCENDING)], unique=True)
    users_collection.create_index([("phone", ASCENDING)], unique=True, sparse=True)
    users_collection.create_index([("id", ASCENDING)], unique=True)

    drivers_collection.create_index([("user_id", ASCENDING)], unique=True)
    drivers_collection.create_index([("id", ASCENDING)], unique=True)
    rides_collection.create_index([("id", ASCENDING)], unique=True)
    rides_collection.create_index([("status", ASCENDING)])

    trips_collection.create_index([("id", ASCENDING)], unique=True)
    shipments_collection.create_index([("id", ASCENDING)], unique=True)

    finance_collection.create_index([("id", ASCENDING)], unique=True)
    finance_collection.create_index([("user_id", ASCENDING)])

    marketplace_collection.create_index([("id", ASCENDING)], unique=True)
    invoices_collection.create_index([("id", ASCENDING)], unique=True)
    invoices_collection.create_index([("load_id", ASCENDING)])
    invoices_collection.create_index([("customer_id", ASCENDING)])
    invoices_collection.create_index([("customer_email", ASCENDING)])
    invoices_collection.create_index([("status", ASCENDING)])
    payments_collection.create_index([("id", ASCENDING)], unique=True)
    payments_collection.create_index([("invoice_id", ASCENDING)])
    payments_collection.create_index([("ride_id", ASCENDING)])
    payments_collection.create_index([("payment_context", ASCENDING)])
    payments_collection.create_index([("user_id", ASCENDING)])
    payments_collection.create_index([("driver_id", ASCENDING)])
    payments_collection.create_index([("order_id", ASCENDING)], unique=True)
    payments_collection.create_index([("payment_id", ASCENDING)], unique=True, sparse=True)
    pod_collection.create_index([("id", ASCENDING)], unique=True)
    pod_collection.create_index([("load_id", ASCENDING)])
    route_plans_collection.create_index([("id", ASCENDING)], unique=True)
    route_plans_collection.create_index([("load_id", ASCENDING)])
    tracking_collection.create_index([("ride_id", ASCENDING)], unique=True)
    tracking_collection.create_index([("updated_at", ASCENDING)])
