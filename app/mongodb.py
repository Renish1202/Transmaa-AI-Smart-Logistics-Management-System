import os
from datetime import datetime, timezone

from pymongo import ASCENDING, MongoClient, ReturnDocument

from app.config import MONGODB_DB, MONGODB_URL

mongo_client = MongoClient(MONGODB_URL)
mongo_db = mongo_client[MONGODB_DB]

users_collection = mongo_db["users"]
drivers_collection = mongo_db["drivers"]
rides_collection = mongo_db["rides"]
trips_collection = mongo_db["trips"]
shipments_collection = mongo_db["shipments"]
finance_collection = mongo_db["finance_applications"]
marketplace_collection = mongo_db["vehicle_listings"]
invoices_collection = mongo_db["invoices"]
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
    pod_collection.create_index([("id", ASCENDING)], unique=True)
    pod_collection.create_index([("load_id", ASCENDING)])
    route_plans_collection.create_index([("id", ASCENDING)], unique=True)
    route_plans_collection.create_index([("load_id", ASCENDING)])
    tracking_collection.create_index([("ride_id", ASCENDING)], unique=True)
    tracking_collection.create_index([("updated_at", ASCENDING)])
