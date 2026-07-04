"""Project CRUD routes."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Project, Session as SessionModel


router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    description: str = ""
    local_path: str = ""


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    local_path: str
    archived: bool
    session_count: int

    class Config:
        from_attributes = True


def _to_out(project: Project, db: Session) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description or "",
        local_path=project.local_path or "",
        archived=bool(project.archived),
        session_count=db.query(SessionModel).filter(SessionModel.project_id == project.id).count(),
    )


@router.get("", response_model=List[ProjectOut])
def list_projects(archived: Optional[bool] = None, db: Session = Depends(get_db)):
    query = db.query(Project)
    if archived is not None:
        query = query.filter(Project.archived == archived)
    projects = query.order_by(Project.updated_at.desc()).all()
    return [_to_out(project, db) for project in projects]


@router.post("/{pid}/archive")
def archive_project(pid: str, db: Session = Depends(get_db)):
    project = db.query(Project).get(pid)
    if not project:
        raise HTTPException(404, "Project does not exist")
    project.archived = not bool(project.archived)
    db.commit()
    return {"ok": True, "archived": bool(project.archived)}


@router.post("", response_model=ProjectOut)
def create_project(inp: ProjectIn, db: Session = Depends(get_db)):
    project = Project(
        id=uuid.uuid4().hex,
        name=inp.name,
        description=inp.description,
        local_path=inp.local_path,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_out(project, db)


@router.put("/{pid}", response_model=ProjectOut)
def update_project(pid: str, inp: ProjectIn, db: Session = Depends(get_db)):
    project = db.query(Project).get(pid)
    if not project:
        raise HTTPException(404, "Project does not exist")
    project.name = inp.name
    project.description = inp.description
    project.local_path = inp.local_path
    db.commit()
    return _to_out(project, db)


@router.delete("/{pid}")
def delete_project(pid: str, db: Session = Depends(get_db)):
    project = db.query(Project).get(pid)
    if not project:
        raise HTTPException(404, "Project does not exist")
    db.delete(project)
    db.commit()
    return {"ok": True}
