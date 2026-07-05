"""Project CRUD routes."""
import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.executor import PROJECT_ARTIFACTS_SUBDIR
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


def _ensure_project_folder(path: str) -> str:
    """Validate a project folder and prepare its workspace artifacts subfolder.

    Returns the resolved absolute path. Raises HTTPException(400) when the path
    cannot be used as a writable project folder.
    """
    if not path:
        return ""
    target = Path(path).expanduser()
    try:
        target.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise HTTPException(400, f"Cannot create or access project folder: {path} ({exc})")
    if not target.is_dir():
        raise HTTPException(400, f"Path is not a directory: {path}")
    if not os.access(target, os.W_OK):
        raise HTTPException(400, f"Project folder is not writable: {path}")
    artifacts_dir = target / PROJECT_ARTIFACTS_SUBDIR
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    return str(target.resolve())


@router.post("", response_model=ProjectOut)
def create_project(inp: ProjectIn, db: Session = Depends(get_db)):
    resolved = _ensure_project_folder(inp.local_path)
    project = Project(
        id=uuid.uuid4().hex,
        name=inp.name,
        description=inp.description,
        local_path=resolved,
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
    if inp.local_path and inp.local_path != project.local_path:
        project.local_path = _ensure_project_folder(inp.local_path)
    else:
        project.local_path = inp.local_path or ""
    db.commit()
    return _to_out(project, db)


@router.get("/{pid}/workspace")
def project_workspace(pid: str, db: Session = Depends(get_db)):
    """Return the active workspace root and artifacts subfolder for a project.

    When the project has a bound folder, artifacts live inside it under
    ``.sw_artifacts``. Otherwise the global app workspaces directory is used.
    """
    from ..config import WORKSPACES_DIR

    project = db.query(Project).get(pid)
    if not project:
        raise HTTPException(404, "Project does not exist")
    if project.local_path:
        root = project.local_path
        artifacts = str(Path(root) / PROJECT_ARTIFACTS_SUBDIR)
        bound = True
    else:
        root = str(WORKSPACES_DIR)
        artifacts = root
        bound = False
    return {"project_id": pid, "root": root, "artifacts_dir": artifacts, "bound": bound}


@router.delete("/{pid}")
def delete_project(pid: str, db: Session = Depends(get_db)):
    project = db.query(Project).get(pid)
    if not project:
        raise HTTPException(404, "Project does not exist")
    db.delete(project)
    db.commit()
    return {"ok": True}
