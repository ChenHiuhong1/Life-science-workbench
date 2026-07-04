"""Chat routes with SSE streaming, persistence, and agent switching."""
import asyncio
import json
from typing import List

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.agent_registry import registry
from ..core.llm import stream_chat
from ..core.tools import tools_for
from ..db.database import get_db
from ..db.models import Message, Session as SessionModel


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    agent: str = "chat"
    messages: List[ChatMessage]
    language: str = "en"


@router.post("/stream")
async def chat_stream(req: ChatRequest, request: Request, db: Session = Depends(get_db)):
    """Stream a chat response as text/event-stream."""
    session = db.query(SessionModel).get(req.session_id)
    agent_key = req.agent
    if session and session.mode and session.mode != req.agent:
        logger.warning(
            f"agent mismatch for session {req.session_id}: requested={req.agent}, session={session.mode}; using session mode"
        )
        agent_key = session.mode

    agent = registry.get(agent_key) or registry.get("chat")
    system_prompt = registry.build_system_prompt(agent.key)
    system_prompt += "\n\n" + _language_instruction(req.language)

    messages = [{"role": item.role, "content": item.content} for item in req.messages]

    if messages and messages[-1]["role"] == "user":
        db.add(Message(
            session_id=req.session_id,
            role="user",
            content=messages[-1]["content"],
        ))
        db.commit()

    tools = tools_for(agent.tools)
    _maybe_update_title(db, req.session_id, messages)

    async def generate():
        assistant_buf = {"content": "", "tool_calls": [], "artifact_ids": []}
        try:
            async for event in stream_chat(
                messages=messages,
                tools=tools,
                system_prompt=system_prompt,
                session_id=req.session_id,
            ):
                if await request.is_disconnected():
                    logger.info(f"client disconnected; stopping stream for session {req.session_id}")
                    break
                if event.startswith("data: "):
                    payload = json.loads(event[6:].strip())
                    if payload.get("type") == "delta":
                        assistant_buf["content"] += payload.get("content", "")
                yield event
        except asyncio.CancelledError:
            logger.info(f"stream response cancelled for session {req.session_id}")
            raise
        except Exception as exc:
            logger.exception("chat stream failed")
            yield f'data: {json.dumps({"type": "error", "message": str(exc)})}\n\n'

        try:
            db.add(Message(
                session_id=req.session_id,
                role="assistant",
                content=assistant_buf["content"],
            ))
            db.commit()
        except Exception:
            db.rollback()

    return StreamingResponse(generate(), media_type="text/event-stream")


def _language_instruction(language: str) -> str:
    if language == "zh":
        return (
            "Respond in Simplified Chinese. Keep code identifiers, package names, file paths, "
            "commands, and precise technical terms in English when that improves clarity."
        )
    return "Respond in English."


def _maybe_update_title(db: Session, session_id: str, messages: list):
    """Use the first user message as the title while the session has a default title."""
    session = db.query(SessionModel).get(session_id)
    if not session or session.title not in {"New Session", "\u65b0\u4f1a\u8bdd"}:
        return
    for message in messages:
        if message["role"] == "user":
            session.title = message["content"][:30].replace("\n", " ")
            db.commit()
            return


@router.get("/agents")
def list_agents():
    return [
        {
            "key": agent.key,
            "label_zh": agent.label_zh,
            "label_en": agent.label_en,
            "icon": agent.icon,
        }
        for agent in registry.list()
    ]
