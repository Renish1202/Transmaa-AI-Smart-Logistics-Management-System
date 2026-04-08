from pydantic import BaseModel, EmailStr, Field
from typing import Literal, Optional

class UserCreate(BaseModel):
    phone: Optional[str] = None
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["user", "driver", "admin"] = "user"

class UserLogin(BaseModel):
    
    
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    phone: Optional[str] = None
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str        


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None
    reset_url: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str = Field(min_length=8, max_length=128)
