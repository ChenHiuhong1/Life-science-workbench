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
from ..core.tools import select_triggered_tools, tools_for
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
    # Per-message override of the thinking tier (none / high / max). Empty
    # means "use the global setting from .env".
    reasoning_effort: str = ""


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

    # Inject AGENTS.md long-term memory. project_path is resolved below, but
    # memory must be ready before the system prompt is used; resolve it the
    # same way here (request value, else the bound project folder).
    from ..core.memory import memory_block_for_prompt
    mem_path = req.project_path or ""
    if not mem_path and session and session.project_id:
        project = db.query(Project).get(session.project_id)
        if project and project.local_path:
            mem_path = project.local_path
    system_prompt += memory_block_for_prompt(mem_path)

    # Resolve the active workspace folder: prefer the request value, then fall back
    # to the project bound to this session so the executor/file operations follow
    # the project folder without the client having to pass it every time.
    project_path = req.project_path or ""
    if not project_path and session and session.project_id:
        project = db.query(Project).get(session.project_id)
        if project and project.local_path:
            project_path = project.local_path

    messages = [{"role": item.role, "content": item.content or ""} for item in req.messages]

    if messages and messages[-1]["role"] == "user":
        db.add(Message(
            session_id=req.session_id,
            role="user",
            content=messages[-1]["content"],
        ))
        db.commit()

    latest_user_text = next((message["content"] for message in reversed(messages) if message["role"] == "user"), "")
    triggered_tool_keys = select_triggered_tools(agent.tools, latest_user_text, agent.key)
    tools = tools_for(triggered_tool_keys)
    logger.debug(
        f"[tools] session={req.session_id} agent={agent.key} triggered={triggered_tool_keys or []}"
    )
    _maybe_update_title(db, req.session_id, messages)

    async def generate():
        assistant_buf = {"content": "", "tool_calls": [], "artifact_ids": []}
        # Emit a meta event with the (possibly just-updated) session title so
        # the frontend can refresh the sidebar entry live, instead of the user
        # seeing "New Session" until they reload the project.
        try:
            refreshed = db.query(SessionModel).get(req.session_id)
            if refreshed:
                yield f'data: {json.dumps({"type": "meta", "session_id": req.session_id, "title": refreshed.title})}\n\n'
        except Exception:
            pass
        try:
            async for event in stream_chat(
                messages=messages,
                tools=tools,
                system_prompt=system_prompt,
                session_id=req.session_id,
                project_path=project_path,
                effort_override=req.reasoning_effort or "",
                agent_key=agent.key,
            ):
                if await request.is_disconnected():
                    logger.info(f"client disconnected; stopping stream for session {req.session_id}")
                    break
                if event.startswith("data: "):
                    try:
                        payload = json.loads(event[6:].strip())
                        if payload.get("type") == "delta":
                            assistant_buf["content"] += payload.get("content") or ""
                    except (ValueError, TypeError):
                        pass
                yield event
        except asyncio.CancelledError:
            logger.info(f"stream response cancelled for session {req.session_id}")
            _persist_assistant(req.session_id, assistant_buf["content"])
            raise
        except Exception as exc:
            logger.exception("chat stream failed")
            yield f'data: {json.dumps({"type": "error", "message": str(exc)})}\n\n'

        # Persist with a fresh session rather than the request-scoped one. The
        # request-scoped SessionLocal is shared across many await points during
        # streaming and SQLAlchemy Sessions are not concurrency-safe; using a
        # dedicated session here keeps the post-stream write isolated and lets
        # it succeed even if FastAPI is tearing the request down.
        _persist_assistant(req.session_id, assistant_buf["content"])

    return StreamingResponse(generate(), media_type="text/event-stream")


def _persist_assistant(session_id: str, content: str) -> None:
    """Persist the assistant turn in its own DB session, swallow failures.

    A short/duplicate final newline or empty content is still persisted so the
    conversation history stays coherent (an assistant turn was emitted), but
    any DB error is contained: it never propagates into the (already-finishing)
    stream and corrupt an unrelated session.
    """
    from ..db.database import SessionLocal

    db = SessionLocal()
    try:
        db.add(Message(session_id=session_id, role="assistant", content=content or ""))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning(f"failed to persist assistant message for session {session_id}")
    finally:
        db.close()


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
    "document": "scientific document",
    "code": "analysis code / script",
    "assistant_output": "assistant output",
}


_REVIEW_INSTRUCTIONS = {
    "code": (
        "Review the following code or script for correctness, reproducibility, safe file paths, dependency "
        "assumptions, error handling, statistical/analysis validity, and whether expected Figure/Table/Script/Data "
        "artifacts are saved clearly. Output a checkable, severity-sorted list. For every item include status "
        "(verified / needs check / violation), location (line, block, or quote), problem, and concrete revision "
        "advice. End with the top 3 fixes.\n\n"
    ),
    "assistant_output": (
        "Review the following assistant output for completeness, internal consistency, unsupported claims, missing "
        "artifact summaries, missing visual/figure checks, unclear file paths, and whether the answer actually "
        "resolves the user's request. Output a checkable, severity-sorted list with status, location, problem, "
        "and concrete revision advice. End with the top 3 fixes.\n\n"
    ),
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
    if req.document_type in _REVIEW_INSTRUCTIONS:
        instruction = (
            _REVIEW_INSTRUCTIONS[req.document_type]
            + f"=== {doc_label.upper()} BEGIN ===\n{document_body}\n=== {doc_label.upper()} END ==="
        )
    else:
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
