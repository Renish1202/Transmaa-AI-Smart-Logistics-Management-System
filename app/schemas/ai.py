from pydantic import BaseModel, Field
from typing import Literal, List, Optional


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class SupportChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: List[ChatMessage] = Field(default_factory=list)


class SupportChatResponse(BaseModel):
    reply: str
    model: Optional[str] = None
