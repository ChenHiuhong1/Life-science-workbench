"""Local filesystem browsing and folder actions."""
import os
import platform
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import APP_HOME, WORKSPACES_DIR


router = APIRouter(prefix="/api/fs", tags=["filesystem"])


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool


class PathIn(BaseModel):
    path: str = ""


@router.get("/browse", response_model=List[DirEntry])
def browse(path: str = "", dirs_only: bool = False, include_files: bool = False):
    if not path:
        return _roots()

    target = Path(path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(400, f"Path does not exist or is not a directory: {path}")

    entries = []
    try:
        for child in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
            if child.name.startswith(".") or child.name.startswith("$"):
                continue
            is_dir = child.is_dir()
            if not is_dir and not include_files:
                continue
            if dirs_only and not is_dir:
                continue
            entries.append(DirEntry(name=child.name, path=str(child.resolve()), is_dir=is_dir))
    except PermissionError:
        raise HTTPException(403, f"Permission denied: {path}")
    return entries


@router.get("/home")
def get_home():
    roots = _roots()
    return {
        "home": str(Path.home()),
        "app_home": str(APP_HOME),
        "workspaces": str(WORKSPACES_DIR),
        "roots": [root.path for root in roots],
    }


@router.get("/project/{project_id}")
def get_project_root(project_id: str):
    """Return the folder the file browser should open for a project.

    Falls back to the global workspaces directory when the project has no
    bound folder yet so the UI always has somewhere to start.
    """
    from ..db.database import SessionLocal
    from ..db.models import Project

    db = SessionLocal()
    try:
        project = db.query(Project).get(project_id)
        root = (project.local_path or "").strip() if project else ""
    finally:
        db.close()

    if root and Path(root).exists():
        return {"project_id": project_id, "root": root, "bound": True}
    return {"project_id": project_id, "root": str(WORKSPACES_DIR), "bound": False}


@router.post("/validate")
def validate(inp: Optional[PathIn] = None, path: str = ""):
    path = (inp.path if inp else path) or ""
    target = Path(path)
    if not path:
        return {"valid": False, "reason": "Path is empty"}
    if target.exists():
        if not target.is_dir():
            return {"valid": False, "reason": "Path is a file, not a directory"}
        if not os.access(target, os.W_OK):
            return {"valid": False, "reason": "Directory is not writable"}
        return {"valid": True, "exists": True}
    try:
        target.mkdir(parents=True, exist_ok=True)
        return {"valid": True, "exists": False, "created": True}
    except Exception as exc:
        return {"valid": False, "reason": str(exc)}


@router.post("/open-folder")
def open_folder(inp: Optional[PathIn] = None, path: str = ""):
    import subprocess

    path = (inp.path if inp else path) or ""
    target = Path(path)
    if not target.exists():
        target.mkdir(parents=True, exist_ok=True)
    folder = str(target.resolve())
    try:
        if platform.system() == "Windows":
            subprocess.Popen(["explorer", folder])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
        return {"ok": True, "path": folder}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _roots() -> List[DirEntry]:
    if platform.system() == "Windows":
        import string

        drives = []
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if Path(drive).exists():
                drives.append(DirEntry(name=f"{letter}:", path=drive, is_dir=True))
        return drives
    return [DirEntry(name="/", path="/", is_dir=True), DirEntry(name="~", path=str(Path.home()), is_dir=True)]
