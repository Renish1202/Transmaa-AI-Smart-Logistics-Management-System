import hashlib
import hmac
import json
from uuid import uuid4

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.config import (
    PAYMENT_CURRENCY,
    PAYMENT_PROVIDER,
    PAYMENT_SIMULATION_ENABLED,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
)
from app.core.security import get_current_user, require_admin
from app.mongodb import (
    get_next_sequence,
    invoices_collection,
    payments_collection,
    serialize_doc,
    serialize_docs,
    utc_now,
)
from app.schemas.payment import PaymentConfigResponse, PaymentOrderResponse, PaymentVerifyRequest

router = APIRouter(prefix="/payments", tags=["Payments"])


def _gateway_enabled() -> bool:
    return PAYMENT_PROVIDER == "razorpay" and bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


def _invoice_query_for_user(invoice_id: int, current_user: dict) -> dict:
    return {
        "id": invoice_id,
        "$or": [
            {"customer_id": current_user.get("id")},
            {"customer_email": (current_user.get("email") or "").lower()},
        ],
    }


def _to_smallest_currency_unit(amount: float) -> int:
    return int(round(float(amount) * 100))


def _invoice_total_amount(invoice: dict) -> float:
    return float(invoice.get("amount") or 0)


def _invoice_remaining_amount(invoice: dict) -> float:
    if invoice.get("balance_amount") is not None:
        return max(float(invoice.get("balance_amount") or 0), 0.0)
    total = _invoice_total_amount(invoice)
    paid = float(invoice.get("amount_paid") or 0)
    return max(total - paid, 0.0)


def _invoice_currency(invoice: dict) -> str:
    return str(invoice.get("currency") or PAYMENT_CURRENCY or "INR").upper()


def _mark_invoice_paid(invoice: dict, payment_id: str, order_id: str):
    amount = _invoice_total_amount(invoice)
    invoices_collection.update_one(
        {"id": invoice["id"]},
        {
            "$set": {
                "status": "paid",
                "payment_status": "paid",
                "amount_paid": amount,
                "balance_amount": 0,
                "paid_at": utc_now(),
                "payment_id": payment_id,
                "razorpay_order_id": order_id,
                "updated_at": utc_now(),
            }
        },
    )


@router.get("/config", response_model=PaymentConfigResponse)
def payment_config(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {
        "provider": PAYMENT_PROVIDER,
        "enabled": _gateway_enabled(),
        "key_id": RAZORPAY_KEY_ID if _gateway_enabled() else None,
        "simulation_enabled": PAYMENT_SIMULATION_ENABLED,
    }


@router.get("/my-invoices")
def my_invoices(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can access invoices")

    query = {
        "$or": [
            {"customer_id": current_user.get("id")},
            {"customer_email": (current_user.get("email") or "").lower()},
        ]
    }
    return serialize_docs(invoices_collection.find(query).sort("id", -1))


@router.get("/my-transactions")
def my_transactions(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can access transactions")
    return serialize_docs(payments_collection.find({"user_id": current_user.get("id")}).sort("id", -1))


@router.post("/invoices/{invoice_id}/create-order", response_model=PaymentOrderResponse)
def create_payment_order(invoice_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can pay invoices")

    invoice = serialize_doc(invoices_collection.find_one(_invoice_query_for_user(invoice_id, current_user)))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("status") == "paid" or invoice.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Invoice already paid")

    payable_amount = _invoice_remaining_amount(invoice)
    if payable_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice amount is not payable")

    currency = _invoice_currency(invoice)
    order_amount = _to_smallest_currency_unit(payable_amount)

    if _gateway_enabled():
        receipt = f"INV-{invoice_id}-{get_next_sequence('payment_receipts')}"
        payload = {
            "amount": order_amount,
            "currency": currency,
            "receipt": receipt,
            "notes": {
                "invoice_id": str(invoice_id),
                "user_id": str(current_user.get("id")),
            },
            "payment_capture": 1,
        }
        try:
            response = requests.post(
                "https://api.razorpay.com/v1/orders",
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                json=payload,
                timeout=20,
            )
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="Unable to connect to payment gateway")

        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Payment gateway rejected order creation")

        order = response.json()
        order_id = order.get("id")
        if not order_id:
            raise HTTPException(status_code=502, detail="Payment gateway order id missing")

        invoices_collection.update_one(
            {"id": invoice_id},
            {
                "$set": {
                    "razorpay_order_id": order_id,
                    "payment_status": "initiated",
                    "updated_at": utc_now(),
                }
            },
        )
        return {
            "invoice_id": invoice_id,
            "order_id": order_id,
            "amount": order_amount,
            "currency": currency,
            "key_id": RAZORPAY_KEY_ID,
            "simulate_mode": False,
        }

    if not PAYMENT_SIMULATION_ENABLED:
        raise HTTPException(status_code=503, detail="Payment gateway is not configured")

    local_order_id = f"order_local_{invoice_id}_{get_next_sequence('payment_orders')}"
    invoices_collection.update_one(
        {"id": invoice_id},
        {
            "$set": {
                "razorpay_order_id": local_order_id,
                "payment_status": "initiated",
                "updated_at": utc_now(),
            }
        },
    )
    return {
        "invoice_id": invoice_id,
        "order_id": local_order_id,
        "amount": order_amount,
        "currency": currency,
        "key_id": None,
        "simulate_mode": True,
    }


@router.post("/invoices/{invoice_id}/verify")
def verify_payment(invoice_id: int, payload: PaymentVerifyRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can verify payments")
    if not _gateway_enabled():
        raise HTTPException(status_code=400, detail="Gateway not configured. Use simulation endpoint in development.")

    invoice = serialize_doc(invoices_collection.find_one(_invoice_query_for_user(invoice_id, current_user)))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("status") == "paid":
        return {"message": "Invoice already paid", "invoice_id": invoice_id}

    expected_order = invoice.get("razorpay_order_id")
    if not expected_order or expected_order != payload.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Order mismatch for invoice")

    signature_body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
    expected_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        signature_body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    existing_payment = serialize_doc(payments_collection.find_one({"payment_id": payload.razorpay_payment_id}))
    if existing_payment:
        _mark_invoice_paid(invoice, payload.razorpay_payment_id, payload.razorpay_order_id)
        return {"message": "Payment already verified", "invoice_id": invoice_id}

    payment_record = {
        "id": get_next_sequence("payments"),
        "invoice_id": invoice_id,
        "user_id": current_user.get("id"),
        "provider": "razorpay",
        "order_id": payload.razorpay_order_id,
        "payment_id": payload.razorpay_payment_id,
        "signature": payload.razorpay_signature,
        "amount": _invoice_remaining_amount(invoice) or _invoice_total_amount(invoice),
        "currency": _invoice_currency(invoice),
        "status": "captured",
        "mode": "test" if RAZORPAY_KEY_ID.startswith("rzp_test_") else "live",
        "source": "frontend",
        "created_at": utc_now(),
        "verified_at": utc_now(),
    }
    payments_collection.insert_one(payment_record)
    _mark_invoice_paid(invoice, payload.razorpay_payment_id, payload.razorpay_order_id)

    return {"message": "Payment verified", "invoice_id": invoice_id, "payment_id": payload.razorpay_payment_id}


@router.post("/invoices/{invoice_id}/simulate-success")
def simulate_success(invoice_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "user":
        raise HTTPException(status_code=403, detail="Only users can simulate payments")
    if not PAYMENT_SIMULATION_ENABLED:
        raise HTTPException(status_code=403, detail="Simulation mode disabled")

    invoice = serialize_doc(invoices_collection.find_one(_invoice_query_for_user(invoice_id, current_user)))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("status") == "paid":
        return {"message": "Invoice already paid", "invoice_id": invoice_id}

    order_id = invoice.get("razorpay_order_id")
    if not order_id:
        order_id = f"order_local_{invoice_id}_{get_next_sequence('payment_orders')}"
        invoices_collection.update_one({"id": invoice_id}, {"$set": {"razorpay_order_id": order_id}})

    payment_id = f"pay_local_{uuid4().hex[:20]}"
    payment_record = {
        "id": get_next_sequence("payments"),
        "invoice_id": invoice_id,
        "user_id": current_user.get("id"),
        "provider": "simulation",
        "order_id": order_id,
        "payment_id": payment_id,
        "signature": None,
        "amount": _invoice_remaining_amount(invoice) or _invoice_total_amount(invoice),
        "currency": _invoice_currency(invoice),
        "status": "captured",
        "mode": "simulation",
        "source": "simulate-endpoint",
        "created_at": utc_now(),
        "verified_at": utc_now(),
    }
    payments_collection.insert_one(payment_record)
    _mark_invoice_paid(invoice, payment_id, order_id)

    return {"message": "Simulation payment successful", "invoice_id": invoice_id, "payment_id": payment_id}


@router.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
):
    if not _gateway_enabled() or not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=404, detail="Webhook not configured")

    raw_body = await request.body()
    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    payload = json.loads(raw_body.decode("utf-8"))
    if payload.get("event") != "payment.captured":
        return {"status": "ignored", "event": payload.get("event")}

    payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = payment.get("id")
    order_id = payment.get("order_id")
    if not payment_id or not order_id:
        return {"status": "ignored", "message": "Missing payment identifiers"}

    existing_payment = serialize_doc(payments_collection.find_one({"payment_id": payment_id}))
    if existing_payment:
        return {"status": "ok", "message": "Payment already recorded"}

    invoice = serialize_doc(invoices_collection.find_one({"razorpay_order_id": order_id}))
    if not invoice:
        return {"status": "ignored", "message": "Invoice mapping not found"}

    payment_record = {
        "id": get_next_sequence("payments"),
        "invoice_id": invoice.get("id"),
        "user_id": invoice.get("customer_id"),
        "provider": "razorpay",
        "order_id": order_id,
        "payment_id": payment_id,
        "signature": x_razorpay_signature,
        "amount": float(payment.get("amount", 0)) / 100,
        "currency": str(payment.get("currency") or _invoice_currency(invoice)).upper(),
        "status": str(payment.get("status") or "captured"),
        "mode": "test" if RAZORPAY_KEY_ID.startswith("rzp_test_") else "live",
        "source": "webhook",
        "created_at": utc_now(),
        "verified_at": utc_now(),
    }
    payments_collection.insert_one(payment_record)

    if invoice.get("status") != "paid":
        _mark_invoice_paid(invoice, payment_id, order_id)

    return {"status": "ok"}


@router.get("/admin/transactions")
def admin_transactions(current_user: dict = Depends(require_admin)):
    _ = current_user
    return serialize_docs(payments_collection.find().sort("id", -1))
