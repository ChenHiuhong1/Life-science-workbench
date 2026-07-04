"""Code sandbox and tool execution helpers."""
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

from loguru import logger

from ..config import ARTIFACTS_DIR, settings


def _session_workdir(session_id: str) -> Path:
    workdir = ARTIFACTS_DIR / session_id
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir


def _env_snapshot(language: str) -> str:
    try:
        if language == "r":
            r_exe = shutil.which(settings.r_executable)
            if not r_exe:
                return "R not found"
            proc = subprocess.run([r_exe, "--version"], capture_output=True, text=True, timeout=15)
            return proc.stdout + proc.stderr

        proc = subprocess.run(
            [settings.python_executable, "-m", "pip", "freeze"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return f"{sys.version}\n\n{proc.stdout}"
    except Exception as exc:
        return f"(env snapshot failed: {exc})"


def _run_code(code: str, language: str, session_id: str, timeout: int | None = None) -> dict:
    workdir = _session_workdir(session_id)
    timeout = timeout or settings.sandbox_timeout

    if language == "r":
        ext = ".R"
        cmd = [settings.r_executable]
    else:
        ext = ".py"
        cmd = [settings.python_executable]

    script_path = workdir / f"run_{uuid.uuid4().hex[:8]}{ext}"
    script_path.write_text(code, encoding="utf-8")
    cmd.append(str(script_path))

    before = {path.name for path in workdir.iterdir()}

    env = os.environ.copy()
    env["MPLBACKEND"] = "Agg"
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
        stdout, stderr, returncode = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {timeout}s and was terminated.",
            "returncode": -1,
            "files": [],
            "env_snapshot": "",
        }
    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": f"Interpreter not found: {cmd[0]}. Check settings or install the runtime.",
            "returncode": -1,
            "files": [],
            "env_snapshot": "",
        }

    after = {path.name for path in workdir.iterdir()}
    new_files = sorted(after - before - {script_path.name})
    artifact_exts = {
        ".png", ".jpg", ".jpeg", ".svg", ".pdf", ".tiff", ".tif",
        ".csv", ".tsv", ".xlsx", ".xls", ".txt", ".json",
        ".h5ad", ".h5", ".npy", ".npz", ".pkl", ".parquet",
    }
    new_files = [name for name in new_files if Path(name).suffix.lower() in artifact_exts]

    external = _scan_external_files(stdout + stderr, artifact_exts, workdir)
    for src_path in external:
        try:
            dst = workdir / Path(src_path).name
            if not dst.exists():
                shutil.copy2(src_path, dst)
            if dst.name not in new_files:
                new_files.append(dst.name)
            logger.info(f"[executor] copied external artifact: {src_path} -> {dst.name}")
        except Exception as exc:
            logger.warning(f"[executor] failed to copy external artifact {src_path}: {exc}")

    return {
        "stdout": stdout[:20000],
        "stderr": stderr[:20000],
        "returncode": returncode,
        "files": new_files,
        "env_snapshot": _env_snapshot(language),
        "workdir": str(workdir),
    }


def _scan_external_files(output: str, exts: set, workdir: Path) -> list:
    import re

    pattern = re.compile(
        r'(([A-Za-z]:[\\/][^\s:<>|*?"\']+)|(?:/[^\s:<>|*?"\']+))'
        r'\.(?:png|jpg|jpeg|svg|pdf|tiff?|csv|tsv|xlsx|txt|h5ad|h5|json)',
        re.IGNORECASE,
    )
    found = []
    seen = set()
    for match in pattern.finditer(output):
        path_text = match.group(0).replace('\\', '/')
        full = Path(path_text)
        try:
            real = str(full.resolve())
        except Exception:
            continue
        if real in seen:
            continue
        seen.add(real)
        try:
            full.resolve().relative_to(workdir.resolve())
            continue
        except ValueError:
            pass
        if full.exists() and full.is_file():
            found.append(str(full))
    return found


async def execute_tool_call(name: str, args_raw: str | dict, session_id: str = "default") -> str:
    args = args_raw if isinstance(args_raw, dict) else json.loads(args_raw or "{}")

    if name in ("run_python", "run_r"):
        language = "python" if name == "run_python" else "r"
        code = args.get("code", "")
        if not code.strip():
            return "Error: code argument is empty"
        sid = args.get("session_id", session_id)
        result = _run_code(code, language, sid)
        try:
            _persist_artifact(sid, language, code, result, args.get("title", ""))
        except Exception as exc:
            logger.warning(f"artifact persistence failed: {exc}")
        return _format_run_result(result)

    if name == "search_literature":
        from ..services.literature.aggregator import search_all

        query = args.get("query", "")
        sources = args.get("sources")
        limit = args.get("limit", 10)
        result = await search_all(query, sources=sources, limit=limit)
        return json.dumps(result, ensure_ascii=False)

    return f"Unknown tool: {name}"


def _format_run_result(result: dict) -> str:
    status = "success" if result["returncode"] == 0 else f"return code {result['returncode']}"
    files_line = f"\nArtifact files: {', '.join(result['files'])}" if result["files"] else ""
    return (
        f"[execution {status}]\n"
        f"--- stdout ---\n{result['stdout']}\n"
        + (f"--- stderr ---\n{result['stderr']}\n" if result["stderr"] else "")
        + files_line
    )


def _persist_artifact(session_id: str, language: str, code: str, result: dict, title: str):
    from ..db.database import SessionLocal
    from ..db.models import Artifact

    db = SessionLocal()
    try:
        artifact = Artifact(
            id=uuid.uuid4().hex,
            session_id=session_id,
            kind="figure" if any(name.endswith((".png", ".svg", ".pdf", ".tiff")) for name in result["files"]) else "code",
            title=title or f"{language} execution artifact",
            language=language,
            code=code,
            output=result["stdout"] + ("\n" + result["stderr"] if result["stderr"] else ""),
            files=[f"{session_id}/{name}" for name in result["files"]],
            env_snapshot=result.get("env_snapshot", ""),
        )
        db.add(artifact)
        db.commit()
    finally:
        db.close()
