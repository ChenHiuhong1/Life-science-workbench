"""Artifact listing, preview and folder actions."""
from pathlib import Path
import platform
import subprocess

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import ARTIFACTS_DIR
from ..core.executor import PROJECT_ARTIFACTS_SUBDIR
from ..db.database import SessionLocal
from ..db.models import Artifact


router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


class ArtifactPathIn(BaseModel):
    path: str
    project_path: str = ""


def _resolve_artifact_root(project_path: str = "") -> Path:
    """Return the base directory that backs artifact files for a project.

    When ``project_path`` is given, artifacts live inside the project at
    ``<project_path>/.sw_artifacts``; otherwise the global ``ARTIFACTS_DIR`` is
    used so legacy sessions keep working.
    """
    if project_path:
        return Path(project_path).expanduser() / PROJECT_ARTIFACTS_SUBDIR
    return ARTIFACTS_DIR


@router.get("/session/{sid}")
def list_session_artifacts(sid: str):
    db = SessionLocal()
    try:
        artifacts = (
            db.query(Artifact)
            .filter(Artifact.session_id == sid)
            .order_by(Artifact.created_at.desc())
            .all()
        )
        return [
            {
                "id": item.id,
                "kind": item.kind,
                "title": item.title,
                "language": item.language,
                "code": item.code,
                "output": item.output,
                "files": item.files,
                "project_path": item.project_path or "",
                "env_snapshot": (item.env_snapshot or "")[:1500],
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in artifacts
        ]
    finally:
        db.close()


def _safe_artifact_path(path: str, project_path: str = "") -> Path:
    root_dir = _resolve_artifact_root(project_path)
    full = (root_dir / path).resolve()
    root = root_dir.resolve()
    try:
        full.relative_to(root)
    except ValueError:
        raise HTTPException(403, "Invalid artifact path")
    return full


@router.get("/file/{path:path}")
def download_file(path: str, project_path: str = ""):
    full = _safe_artifact_path(path, project_path)
    if not full.exists() or not full.is_file():
        raise HTTPException(404, "Artifact file does not exist")
    return FileResponse(str(full))


@router.post("/open-folder")
def open_artifact_folder(inp: ArtifactPathIn):
    full = _safe_artifact_path(inp.path, inp.project_path)
    folder = full.parent if full.suffix else full
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)

    try:
        if platform.system() == "Windows":
            subprocess.Popen(["explorer", str(folder)])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(folder)])
        else:
            subprocess.Popen(["xdg-open", str(folder)])
        return {"ok": True, "path": str(folder)}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "path": str(folder)}


@router.get("/{aid}")
def get_artifact(aid: str):
    db = SessionLocal()
    try:
        item = db.query(Artifact).get(aid)
        if not item:
            raise HTTPException(404, "Artifact does not exist")
        return {
            "id": item.id,
            "kind": item.kind,
            "title": item.title,
            "language": item.language,
            "code": item.code,
            "output": item.output,
            "files": item.files,
            "project_path": item.project_path or "",
            "env_snapshot": item.env_snapshot,
        }
    finally:
        db.close()
