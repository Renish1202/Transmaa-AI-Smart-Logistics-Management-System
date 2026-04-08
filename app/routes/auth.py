from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, timezone
import hashlib
import secrets
from app.core.security import hash_password, verify_password, create_access_token
from app.mongodb import get_next_sequence, serialize_doc, users_collection, utc_now
from app.schemas.user import (
    UserCreate,
    UserResponse,
    Token,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
)
from app.config import (
    RESET_TOKEN_EXPIRE_MINUTES,
    RESET_TOKEN_DEBUG,
    FRONTEND_BASE_URL,
)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

ALLOWED_SELF_SIGNUP_ROLES = {"user", "driver"}

# ---------------- REGISTER ---------------- #
@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    normalized_email = str(user.email).lower()
    normalized_phone = user.phone.strip() if user.phone else None
    if normalized_phone == "":
        normalized_phone = None

    existing_user = users_collection.find_one({"email": normalized_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if user.role not in ALLOWED_SELF_SIGNUP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role for self registration")

    if normalized_phone:
        existing_phone = users_collection.find_one({"phone": normalized_phone})
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone already registered")

    new_user = {
        "id": get_next_sequence("users"),
        "email": normalized_email,
        "password": hash_password(user.password),
        "role": user.role,
        "is_active": True,
        "created_at": utc_now(),
    }
    if normalized_phone:
        new_user["phone"] = normalized_phone
    users_collection.insert_one(new_user)

    return {
        "id": new_user["id"],
        "phone": new_user.get("phone"),
        "role": new_user["role"],
    }


# ---------------- LOGIN ---------------- #
@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    user = serialize_doc(users_collection.find_one({"email": form_data.username.lower()}))

    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    access_token = create_access_token(
        data={
            "sub": user["email"],
            "role": user["role"],
            "user_id": user["id"]
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# ---------------- FORGOT PASSWORD ---------------- #
@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.lower()
    user = users_collection.find_one({"email": email})
    response = {
        "message": "If an account with that email exists, a reset link has been sent."
    }

    if not user:
        return response

    reset_token = secrets.token_urlsafe(32)
    reset_token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
    expires_at = utc_now() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)

    users_collection.update_one(
        {"email": email},
        {
            "$set": {
                "reset_token_hash": reset_token_hash,
                "reset_token_expires_at": expires_at,
                "reset_token_created_at": utc_now(),
            },
            "$unset": {"reset_token_used_at": ""},
        },
    )

    if RESET_TOKEN_DEBUG:
        response["reset_token"] = reset_token
        response["reset_url"] = f"{FRONTEND_BASE_URL}/reset-password?email={email}&token={reset_token}"

    return response


# ---------------- RESET PASSWORD ---------------- #
@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    email = payload.email.lower()
    user = serialize_doc(users_collection.find_one({"email": email}))

    if not user or not user.get("reset_token_hash") or not user.get("reset_token_expires_at"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if user.get("reset_token_used_at"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = user["reset_token_expires_at"]
    if getattr(expires_at, "tzinfo", None) is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < utc_now():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    reset_token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    if reset_token_hash != user.get("reset_token_hash"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    users_collection.update_one(
        {"email": email},
        {
            "$set": {
                "password": hash_password(payload.new_password),
                "reset_token_used_at": utc_now(),
            },
            "$unset": {
                "reset_token_hash": "",
                "reset_token_expires_at": "",
                "reset_token_created_at": "",
            },
        },
    )

    return {"message": "Password reset successful"}
