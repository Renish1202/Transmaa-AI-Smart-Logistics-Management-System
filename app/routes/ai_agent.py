from typing import Optional
from typing_extensions import TypedDict
from fastapi import APIRouter, Depends
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from app.config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_NUM_CTX,
    OLLAMA_NUM_PREDICT,
    OLLAMA_TEMPERATURE,
    OLLAMA_KEEP_ALIVE,
)
from app.core.security import get_current_user
from app.mongodb import rides_collection, serialize_docs
from app.schemas.agent import AgentChatRequest, AgentChatResponse, PendingAction
from app.agent.tools import TOOL_REGISTRY, execute_tool, LANGCHAIN_TOOLS

router = APIRouter(prefix="/ai", tags=["AI Agent"])

SYSTEM_PROMPT = (
    "Transmaa support agent. Use tools when needed, ask for missing inputs, never invent ride ids, be concise."
)


class AgentState(TypedDict):
    messages: list[BaseMessage]
    tool_call: Optional[dict]
    reply: Optional[str]
    pending_action: Optional[PendingAction]
    requires_confirmation: bool


def build_user_context(current_user: dict) -> str:
    role = current_user.get("role", "user")
    email = current_user.get("email", "unknown")
    user_id = current_user.get("id")

    context_lines = [
        f"User email: {email}",
        f"User role: {role}",
    ]

    if role == "user":
        recent_rides = serialize_docs(
            rides_collection.find({"passenger_id": user_id}).sort("id", -1).limit(1)
        )
        if recent_rides:
            context_lines.append("Recent rides:")
            for ride in recent_rides:
                context_lines.append(
                    f"- Ride #{ride.get('id')}: {ride.get('pickup_location')} -> {ride.get('drop_location')}, status={ride.get('status')}"
                )

    if role == "driver":
        recent_rides = serialize_docs(
            rides_collection.find({"driver_id": user_id}).sort("id", -1).limit(1)
        )
        if recent_rides:
            context_lines.append("Recent assigned rides:")
            for ride in recent_rides:
                context_lines.append(
                    f"- Ride #{ride.get('id')}: {ride.get('pickup_location')} -> {ride.get('drop_location')}, status={ride.get('status')}"
                )

    return "\n".join(context_lines)


def summarize_tool_result(tool_name: str, result: dict) -> str:
    if not result.get("ok"):
        return result.get("error", "Action failed")

    data = result.get("data")
    if tool_name == "get_recent_rides":
        if not data:
            return "You have no rides yet."
        lines = []
        for ride in data:
            lines.append(
                f"Ride #{ride.get('id')}: {ride.get('pickup_location')} -> {ride.get('drop_location')}, status={ride.get('status')}"
            )
        return "Here are your recent rides:\n" + "\n".join(lines)

    if tool_name == "get_ride_status":
        return (
            f"Ride #{data.get('id')} is currently {data.get('status')}. "
            f"Route: {data.get('pickup_location')} -> {data.get('drop_location')}."
        )

    if tool_name == "get_driver_status":
        return (
            f"Your driver verification status is {data.get('verification_status')}. "
            f"Vehicle: {data.get('vehicle_number') or 'N/A'}."
        )

    if tool_name == "request_ride":
        return (
            f"Your ride request has been created. Ride #{data.get('id')} is now {data.get('status')}."
        )

    if tool_name == "cancel_ride":
        return f"Ride #{data.get('id')} has been cancelled."

    return "Done."


def confirmation_message(tool_name: str, args: dict) -> str:
    if tool_name == "cancel_ride":
        return f"I can cancel ride #{args.get('ride_id')}. Do you want me to proceed?"
    if tool_name == "request_ride":
        return "I can create a ride request with the provided details. Do you want me to proceed?"
    return "Do you want me to proceed with this action?"


def build_graph(llm, current_user: dict):
    def agent_node(state: AgentState):
        response: AIMessage = llm.invoke(state["messages"])
        tool_calls = getattr(response, "tool_calls", None) or []
        if tool_calls:
            return {
                "messages": state["messages"] + [response],
                "tool_call": tool_calls[0],
            }
        return {"messages": state["messages"] + [response], "reply": response.content or ""}

    def route(state: AgentState):
        return "tool" if state.get("tool_call") else END

    def tool_node(state: AgentState):
        tool_call = state.get("tool_call") or {}
        tool_name = tool_call.get("name")
        args = tool_call.get("args") or {}
        tool_meta = TOOL_REGISTRY.get(tool_name)
        if not tool_meta:
            return {"reply": "I couldn't find the right tool for that request."}

        if tool_meta.get("risk") == "risky":
            pending = PendingAction(tool=tool_name, args=args)
            return {
                "reply": confirmation_message(tool_name, args),
                "pending_action": pending,
                "requires_confirmation": True,
            }

        _, result = execute_tool(current_user, tool_name, args)
        return {"reply": summarize_tool_result(tool_name, result)}

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tool", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", route)
    graph.add_edge("tool", END)
    return graph.compile()


@router.post("/agent", response_model=AgentChatResponse)
def agent_chat(
    payload: AgentChatRequest,
    current_user: dict = Depends(get_current_user),
):
    if payload.pending_action is not None and payload.confirm is not None:
        if payload.confirm is False:
            return AgentChatResponse(reply="Okay, I won't proceed with that action.")

        tool_name = payload.pending_action.tool
        args = payload.pending_action.args or {}
        _, result = execute_tool(current_user, tool_name, args)
        return AgentChatResponse(reply=summarize_tool_result(tool_name, result), model=OLLAMA_MODEL)

    llm = ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=OLLAMA_TEMPERATURE,
        num_predict=OLLAMA_NUM_PREDICT,
        num_ctx=OLLAMA_NUM_CTX,
        keep_alive=OLLAMA_KEEP_ALIVE,
    ).bind_tools(LANGCHAIN_TOOLS)

    context = build_user_context(current_user)

    messages: list[BaseMessage] = [SystemMessage(SYSTEM_PROMPT)]
    if context:
        messages.append(SystemMessage(f"Context:\n{context}"))

    for msg in payload.history[-3:]:
        if msg.role == "user":
            messages.append(HumanMessage(msg.content))
        else:
            messages.append(AIMessage(msg.content))

    messages.append(HumanMessage(payload.message))

    graph = build_graph(llm, current_user)
    result = graph.invoke({"messages": messages})

    return AgentChatResponse(
        reply=result.get("reply") or "",
        requires_confirmation=bool(result.get("requires_confirmation")),
        pending_action=result.get("pending_action"),
        model=OLLAMA_MODEL,
    )
