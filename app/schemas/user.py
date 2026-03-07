from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class UserCreate(BaseModel):
    phone: Optional[str] = None
    email: EmailStr
    password: str
    role: Optional[str] = "user" # customer / driver / admin

class UserLogin(BaseModel):
    
    
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    phone: str
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str        
