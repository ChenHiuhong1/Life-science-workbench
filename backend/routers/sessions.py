"""Session CRUD routes."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Message, Session as SessionModel


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionIn(BaseModel):
    project_id: str
    title: str = "New Session"
    mode: str = "chat"


class SessionOut(BaseModel):
    id: str
    project_id: str
    title: str
    mode: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[SessionOut])
def list_sessions(project_id: str, db: Session = Depends(get_db)):
    query = db.query(SessionModel).filter(SessionModel.project_id == project_id)
    return query.order_by(SessionModel.updated_at.desc()).all()


@router.post("", response_model=SessionOut)
def create_session(inp: SessionIn, db: Session = Depends(get_db)):
    session = SessionModel(
        id=uuid.uuid4().hex,
        project_id=inp.project_id,
        title=inp.title,
        mode=inp.mode,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.put("/{sid}", response_model=SessionOut)
def update_session(sid: str, title: Optional[str] = None, mode: Optional[str] = None, db: Session = Depends(get_db)):
    session = db.query(SessionModel).get(sid)
    if not session:
        raise HTTPException(404, "Session does not exist")
    if title:
        session.title = title
    if mode:
        session.mode = mode
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{sid}")
def delete_session(sid: str, db: Session = Depends(get_db)):
    session = db.query(SessionModel).get(sid)
    if not session:
        raise HTTPException(404, "Session does not exist")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/{sid}/messages")
def get_messages(sid: str, db: Session = Depends(get_db)):
    messages = db.query(Message).filter(Message.session_id == sid).order_by(Message.id).all()
    return [
        {
            "id": item.id,
            "role": item.role,
            "content": item.content,
            "tool_calls": item.tool_calls or [],
            "citations": item.citations or [],
            "artifact_ids": item.artifact_ids or [],
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in messages
    ]
