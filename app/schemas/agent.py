from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class PendingAction(BaseModel):
    tool: str
    args: Dict[str, object] = Field(default_factory=dict)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: List[ChatMessage] = Field(default_factory=list)
    pending_action: Optional[PendingAction] = None
    confirm: Optional[bool] = None


class AgentChatResponse(BaseModel):
    reply: str
    requires_confirmation: bool = False
    pending_action: Optional[PendingAction] = None
    model: Optional[str] = None
