"""Chat routes with SSE streaming, persistence, and agent switching."""
import asyncio
import json
import uuid
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
from ..db.models import Message, Project, Session as SessionModel


router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    agent: str = "chat"
    messages: List[ChatMessage]
    language: str = "en"
    project_path: str = ""


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

    # Resolve the active workspace folder: prefer the request value, then fall back
    # to the project bound to this session so the executor/file operations follow
    # the project folder without the client having to pass it every time.
    project_path = req.project_path or ""
    if not project_path and session and session.project_id:
        project = db.query(Project).get(session.project_id)
        if project and project.local_path:
            project_path = project.local_path

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
                project_path=project_path,
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


class ReviewDocumentRequest(BaseModel):
    """One-shot document review request submitted from the document editor."""

    document_text: str
    document_type: str = "manuscript"  # manuscript | protocol | proposal
    language: str = "en"
    project_path: str = ""


_REVIEW_TYPE_LABEL = {
    "manuscript": "manuscript",
    "protocol": "wet-lab protocol",
    "proposal": "research proposal / study design",
}


@router.post("/review-document")
async def review_document(req: ReviewDocumentRequest, request: Request):
    """Run the reviewer agent on a standalone document without touching chat history.

    The reviewer's full constraint stack (Nature-style, critical appraisal,
    protocol review rules) is reused by building its system prompt directly.
    The review streams back as the same SSE event shape as ``/api/chat/stream``
    so the frontend can reuse its parsing pipeline.
    """
    document_body = (req.document_text or "").strip()
    if not document_body:
        async def empty():
            yield 'data: {"type": "error", "message": "Document is empty; nothing to review."}\n\n'
        return StreamingResponse(empty(), media_type="text/event-stream")

    agent = registry.get("reviewer") or registry.get("chat")
    system_prompt = registry.build_system_prompt(agent.key)
    system_prompt += "\n\n" + _language_instruction(req.language)

    doc_label = _REVIEW_TYPE_LABEL.get(req.document_type, req.document_type or "document")
    instruction = (
        f"Perform a full review of the following {doc_label}. Output a checkable, "
        "severity-sorted list. For every item include status (verified / needs check / "
        "violation), location (section, line, or quote), problem, and concrete revision "
        "advice. Do not mark anything as verified unless the document or a cited source "
        "clearly supports it. End with a short overall assessment and the top 3 priority "
        "revisions.\n\n"
        f"=== {doc_label.upper()} BEGIN ===\n{document_body}\n=== {doc_label.upper()} END ==="
    )

    messages = [{"role": "user", "content": instruction}]
    review_session = f"review-{uuid.uuid4().hex[:12]}"

    async def generate():
        try:
            async for event in stream_chat(
                messages=messages,
                tools=[],
                system_prompt=system_prompt,
                session_id=review_session,
                project_path=req.project_path,
            ):
                if await request.is_disconnected():
                    logger.info("document review stream disconnected")
                    break
                yield event
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("document review stream failed")
            yield f'data: {json.dumps({"type": "error", "message": str(exc)})}\n\n'

    return StreamingResponse(generate(), media_type="text/event-stream")
