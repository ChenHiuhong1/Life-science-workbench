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


PROJECT_ARTIFACTS_SUBDIR = "artifacts"


def _resolve_dirs(session_id: str, project_path: str = "") -> tuple[Path, Path]:
    """Return (cwd, artifacts_dir) for a session.

    Design: the agent runs code with cwd == the project root, so it can freely
    read any file in the project via plain relative paths (e.g.
    ``pd.read_csv("data.csv")``). Generated artifacts are then gathered into a
    per-session subfolder ``<project>/artifacts/<session>/`` to keep the project
    root tidy and isolate sessions.

    When no project folder is bound, both cwd and artifacts_dir collapse to the
    legacy global ``ARTIFACTS_DIR/<session>`` location.
    """
    if project_path:
        cwd = Path(project_path).expanduser()
        artifacts_dir = cwd / PROJECT_ARTIFACTS_SUBDIR / session_id
    else:
        cwd = ARTIFACTS_DIR / session_id
        artifacts_dir = cwd
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    return cwd, artifacts_dir


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


def _run_code(code: str, language: str, session_id: str, timeout: int | None = None, project_path: str = "") -> dict:
    cwd, artifacts_dir = _resolve_dirs(session_id, project_path)
    timeout = timeout or settings.sandbox_timeout

    if language == "r":
        ext = ".R"
        cmd = [settings.r_executable]
    else:
        ext = ".py"
        cmd = [settings.python_executable]

    # The script lives in the (hidden) artifacts dir so it never clutters the
    # project root, but the process runs with cwd == project root.
    script_path = artifacts_dir / f"run_{uuid.uuid4().hex[:8]}{ext}"
    script_path.write_text(code, encoding="utf-8")
    cmd.append(str(script_path))

    # Snapshot only top-level entries of the cwd so we can diff what the run
    # created. We deliberately do not recurse, so the agent's own nested output
    # folders are not swept up wholesale.
    def _top_entries(p: Path) -> set[str]:
        try:
            return {child.name for child in p.iterdir()}
        except Exception:
            return set()

    before = _top_entries(cwd)

    env = os.environ.copy()
    env["MPLBACKEND"] = "Agg"
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
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

    after = _top_entries(cwd)
    created = after - before
    artifact_exts = {
        ".png", ".jpg", ".jpeg", ".svg", ".pdf", ".tiff", ".tif",
        ".csv", ".tsv", ".xlsx", ".xls", ".txt", ".json",
        ".h5ad", ".h5", ".npy", ".npz", ".pkl", ".parquet",
    }

    # Gather artifacts the agent wrote into the project root and move them into
    # the per-session artifacts dir. External absolute-path files mentioned in
    # stdout/stderr are copied in too so the artifact panel can preview them.
    new_files: list[str] = []
    for name in sorted(created):
        src = cwd / name
        if not src.is_file():
            continue
        if src.suffix.lower() not in artifact_exts:
            continue
        dst = artifacts_dir / name
        try:
            if dst.exists():
                dst.unlink()
            shutil.move(str(src), str(dst))
            new_files.append(name)
            logger.info(f"[executor] gathered artifact: {name} -> {dst}")
        except Exception as exc:
            logger.warning(f"[executor] failed to gather {name}: {exc}")

    external = _scan_external_files(stdout + stderr, artifact_exts, cwd)
    for src_path in external:
        try:
            dst = artifacts_dir / Path(src_path).name
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
        "workdir": str(cwd),
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


async def execute_tool_call(name: str, args_raw: str | dict, session_id: str = "default", project_path: str = "") -> str:
    """Run a tool call and always return a string.

    This function never raises: any failure is caught and returned as a
    session-scoped error string. That keeps a tool error contained to the
    session that triggered it (isolation) and prevents a single bad tool call
    from tearing down the whole SSE stream.
    """
    try:
        if isinstance(args_raw, dict):
            args = args_raw
        else:
            try:
                args = json.loads(args_raw or "{}")
            except (ValueError, TypeError):
                args = {}
        if not isinstance(args, dict):
            args = {}

        if name in ("run_python", "run_r"):
            language = "python" if name == "run_python" else "r"
            code = args.get("code") or ""
            if not code.strip():
                return "Error: code argument is empty"
            # A tool call may not override its own session; forcing the caller's
            # session id keeps artifacts bound to the triggering session.
            sid = session_id
            result = _run_code(code, language, sid, project_path=project_path)
            try:
                _persist_artifact(sid, language, code, result, args.get("title", ""), project_path=project_path)
            except Exception as exc:
                logger.warning(f"artifact persistence failed: {exc}")
            return _format_run_result(result)

        if name == "search_literature":
            from ..services.literature.aggregator import search_all

            query = args.get("query") or ""
            sources = args.get("sources")
            limit = args.get("limit", 10)
            result = await search_all(query, sources=sources, limit=limit)
            return json.dumps(result, ensure_ascii=False)

        return f"Unknown tool: {name}"
    except Exception as exc:
        logger.exception(f"tool '{name}' failed for session {session_id}")
        return f"[tool error] {name} failed: {exc}"


def _format_run_result(result: dict) -> str:
    status = "success" if result["returncode"] == 0 else f"return code {result['returncode']}"
    files_line = f"\nArtifact files: {', '.join(result['files'])}" if result["files"] else ""
    return (
        f"[execution {status}]\n"
        f"--- stdout ---\n{result['stdout']}\n"
        + (f"--- stderr ---\n{result['stderr']}\n" if result["stderr"] else "")
        + files_line
    )


def _persist_artifact(session_id: str, language: str, code: str, result: dict, title: str, project_path: str = ""):
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
            project_path=project_path or "",
        )
        db.add(artifact)
        db.commit()
    finally:
        db.close()
