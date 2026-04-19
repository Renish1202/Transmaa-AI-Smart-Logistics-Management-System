from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from app.config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT_SECONDS,
    OLLAMA_NUM_PREDICT,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_KEEP_ALIVE,
)
from app.rag import retrieve
from app.core.security import get_current_user
from app.mongodb import rides_collection, serialize_docs
from app.schemas.ai import SupportChatRequest, SupportChatResponse

router = APIRouter(prefix="/ai", tags=["AI Support"])

SYSTEM_PROMPT = (
    "You are Transmaa's customer support assistant. "
    "Answer using the provided knowledge snippets when available. "
    "Be concise, clear, and helpful. "
    "If the answer is not in the snippets, say you do not have enough information "
    "and ask a clarifying question or suggest contacting support. "
    "Never claim to perform actions you cannot actually do."
)


def build_rag_context(query: str) -> str:
    try:
        results = retrieve(query)
    except Exception as exc:
        print(f"RAG retrieval error: {exc}")
        return ""

    if not results:
        return ""

    blocks = []
    for idx, (chunk, _score) in enumerate(results, start=1):
        snippet = chunk.content.strip()
        if not snippet:
            continue
        blocks.append(f"[{idx}] Source: {chunk.source}\n{snippet}")

    return "\n\n".join(blocks)


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
            rides_collection.find({"passenger_id": user_id}).sort("id", -1).limit(5)
        )
        if recent_rides:
            context_lines.append("Recent rides:")
            for ride in recent_rides:
                context_lines.append(
                    f"- Ride #{ride.get('id')}: {ride.get('pickup_location')} -> {ride.get('drop_location')}, "
                    f"status={ride.get('status')}"
                )
    elif role == "driver":
        recent_rides = serialize_docs(
            rides_collection.find({"driver_id": user_id}).sort("id", -1).limit(5)
        )
        if recent_rides:
            context_lines.append("Recent assigned rides:")
            for ride in recent_rides:
                context_lines.append(
                    f"- Ride #{ride.get('id')}: {ride.get('pickup_location')} -> {ride.get('drop_location')}, "
                    f"status={ride.get('status')}"
                )

    return "\n".join(context_lines)


@router.post("/support", response_model=SupportChatResponse)
def support_chat(
    payload: SupportChatRequest,
    current_user: dict = Depends(get_current_user),
):
    history = payload.history[-5:]
    context = build_user_context(current_user)
    rag_context = build_rag_context(payload.message)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Context:\n{context}"},
    ]
    if rag_context:
        messages.append({"role": "system", "content": f"Knowledge Base Snippets:\n{rag_context}"})
    else:
        messages.append({"role": "system", "content": "Knowledge Base Snippets: (none found)"})

    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": payload.message})

    body = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "num_predict": OLLAMA_NUM_PREDICT,
            "num_ctx": OLLAMA_NUM_CTX,
            "temperature": OLLAMA_TEMPERATURE,
        },
        "keep_alive": OLLAMA_KEEP_ALIVE,
    }

    try:
        with httpx.Client(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            response = client.post(f"{OLLAMA_BASE_URL}/api/chat", json=body)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        print(f"Ollama timeout: {exc}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama request timed out. Try again or increase OLLAMA_TIMEOUT_SECONDS.",
        )
    except httpx.RequestError as exc:
        print(f"Ollama request error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ollama server not reachable. Please ensure it is running and reachable from the backend.",
        )
    except httpx.HTTPStatusError as exc:
        print(f"Ollama HTTP error: {exc}")
        ollama_detail = ""
        try:
            body = exc.response.json()
            if isinstance(body, dict):
                ollama_detail = str(body.get("error") or body.get("message") or "").strip()
        except ValueError:
            pass
        if not ollama_detail:
            ollama_detail = (exc.response.text or "").strip()
        if ollama_detail:
            detail = f"Ollama error ({exc.response.status_code}): {ollama_detail}"
        else:
            detail = f"Ollama returned HTTP {exc.response.status_code}."
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        )

    reply = data.get("message", {}).get("content")
    if not reply:
        raise HTTPException(status_code=502, detail="Invalid response from Ollama")

    return SupportChatResponse(reply=reply, model=OLLAMA_MODEL)
