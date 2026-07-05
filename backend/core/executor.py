"""Code sandbox and tool execution helpers."""
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from csv import reader as csv_reader
from pathlib import Path
from typing import Any

from loguru import logger

from ..config import ARTIFACTS_DIR, settings


PROJECT_ARTIFACTS_SUBDIR = "artifacts"

SESSION_MODE_SLUGS = {
    "chat": "chat",
    "literature": "literature",
    "brainstorm": "study-design",
    "bio": "bio-analysis",
    "protocol": "protocol",
    "reviewer": "reviewer",
    "module": "module",
    "document": "document",
    "hpc": "hpc",
}

FIGURE_EXTS = {".png", ".jpg", ".jpeg", ".svg", ".pdf", ".tiff", ".tif"}
TABLE_EXTS = {".csv", ".tsv", ".xlsx", ".xls", ".parquet", ".json"}
DATA_EXTS = {".h5ad", ".h5", ".npy", ".npz", ".pkl"}
SCRIPT_EXTS = {".py", ".r", ".R", ".ipynb"}
DOCUMENT_EXTS = {".txt", ".md", ".html", ".htm"}
ARTIFACT_EXTS = FIGURE_EXTS | TABLE_EXTS | DATA_EXTS | SCRIPT_EXTS | DOCUMENT_EXTS


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip().lower()).strip("-._")
    return slug or "session"


def _session_artifact_scope(session_id: str) -> str:
    """Return the user-facing artifact folder for a session.

    Sessions are grouped by module name (e.g. ``bio-analysis``) so users do not
    have to decode opaque UUID folders on disk. If the DB is unavailable, fall
    back to the session id to preserve legacy/test behavior.
    """
    try:
        from ..db.database import SessionLocal
        from ..db.models import Session as SessionModel

        db = SessionLocal()
        try:
            session = db.query(SessionModel).get(session_id)
            if session and session.mode:
                return SESSION_MODE_SLUGS.get(session.mode, _safe_slug(session.mode))
        finally:
            db.close()
    except Exception:
        pass
    return SESSION_MODE_SLUGS.get(session_id, _safe_slug(session_id))


def _category_dir(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {item.lower() for item in FIGURE_EXTS}:
        return "Figure"
    if ext in {item.lower() for item in TABLE_EXTS}:
        return "Table"
    if ext in {item.lower() for item in SCRIPT_EXTS}:
        return "Script"
    if ext in {item.lower() for item in DATA_EXTS}:
        return "Data"
    return "Document"


def _unique_dest(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    for idx in range(2, 1000):
        candidate = parent / f"{stem}_{idx}{suffix}"
        if not candidate.exists():
            return candidate
    return parent / f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"


def _artifact_relpath(path: Path, artifact_root: Path) -> str:
    return path.resolve().relative_to(artifact_root.resolve()).as_posix()


def _next_script_path(script_dir: Path, code: str, language: str, title: str = "") -> Path:
    ext = ".R" if language == "r" else ".py"
    seq = _next_sequence(script_dir)
    slug = _script_slug(code, title)
    return _unique_dest(script_dir / f"{seq:02d}_{slug}{ext}")


def _next_sequence(script_dir: Path) -> int:
    max_seen = 0
    for path in script_dir.glob("*"):
        match = re.match(r"^(\d+)_", path.name)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    return max_seen + 1


def _script_slug(code: str, title: str = "") -> str:
    title = (title or "").strip()
    generic = {"run", "script", "code", "analysis", "plot", "figure", "python execution artifact", "r execution artifact"}
    if title and title.lower() not in generic:
        title_slug = _safe_slug(title)
        if title_slug != "session":
            return title_slug[:64]

    purpose = _derive_script_purpose(code)
    purpose_slug = _safe_slug(purpose)
    if purpose_slug == "session":
        return "analysis_script"
    return purpose_slug[:64]


def _derive_script_purpose(code: str) -> str:
    outputs: list[str] = []
    for path_text in _quoted_paths_after_output_calls(code):
        stem = Path(path_text).stem
        if stem and stem not in outputs:
            outputs.append(stem)
        if len(outputs) >= 2:
            return "_".join(outputs)
    if outputs:
        return "_".join(outputs)

    patterns = [
        r"(?:savefig|ggsave)\s*\(\s*(?:[rRuUfF]+)?['\"]([^'\"]+)['\"]",
        r"\.to_(?:csv|tsv|excel|parquet|json)\s*\(\s*(?:[rRuUfF]+)?['\"]([^'\"]+)['\"]",
        r"(?:write\.csv|write_csv|write_tsv|writeLines)\s*\([^,\n]+,\s*(?:[rRuUfF]+)?['\"]([^'\"]+)['\"]",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, code):
            stem = Path(match.group(1)).stem
            if stem and stem not in outputs:
                outputs.append(stem)
            if len(outputs) >= 2:
                return "_".join(outputs)
    if outputs:
        return "_".join(outputs)

    for line in code.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            comment = stripped.lstrip("#").strip()
            if comment:
                return comment
            continue
        if stripped.lower().startswith(("import ", "from ", "library(")):
            continue
        return stripped[:80]
    return "analysis_script"


def _quoted_paths_after_output_calls(code: str) -> list[str]:
    markers = [
        "savefig(", "ggsave(", ".to_csv(", ".to_excel(", ".to_parquet(", ".to_json(",
        "write.csv(", "write_csv(", "write_tsv(", "writelines(",
    ]
    lowered = code.lower()
    paths: list[str] = []
    for marker in markers:
        pos = 0
        while True:
            idx = lowered.find(marker, pos)
            if idx < 0:
                break
            segment = code[idx + len(marker): idx + len(marker) + 500]
            path_text = _first_quoted_text(segment)
            if path_text:
                paths.append(path_text)
            pos = idx + len(marker)
    return paths


def _first_quoted_text(segment: str) -> str:
    for idx, char in enumerate(segment):
        if char not in {"'", '"'}:
            continue
        end = segment.find(char, idx + 1)
        if end > idx + 1:
            return segment[idx + 1:end]
    return ""


def _resolve_dirs(session_id: str, project_path: str = "") -> tuple[Path, Path]:
    """Return (cwd, artifacts_dir) for a session.

    Design: the agent runs code with cwd == the project root, so it can freely
    read any file in the project via plain relative paths (e.g.
    ``pd.read_csv("data.csv")``). Generated artifacts are then gathered into a
    module subfolder such as ``<project>/artifacts/bio-analysis/Figure/`` to
    keep the project root tidy and make outputs navigable.

    When no project folder is bound, both cwd and artifacts_dir collapse to the
    global ``ARTIFACTS_DIR/<module>`` location.
    """
    scope = _session_artifact_scope(session_id)
    if project_path:
        cwd = Path(project_path).expanduser()
        artifacts_dir = cwd / PROJECT_ARTIFACTS_SUBDIR / scope
    else:
        artifacts_dir = ARTIFACTS_DIR / scope
        cwd = artifacts_dir
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    return cwd, artifacts_dir


def _env_snapshot(language: str) -> str:
    try:
        if language == "r":
            r_exe = shutil.which(settings.r_executable)
            if not r_exe:
                return "R not found"
            proc = subprocess.run([r_exe, "--version"], capture_output=True, text=True, timeout=15)
            return (proc.stdout or "") + (proc.stderr or "")

        proc = subprocess.run(
            [settings.python_executable, "-m", "pip", "freeze"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return f"{sys.version}\n\n{proc.stdout}"
    except Exception as exc:
        return f"(env snapshot failed: {exc})"


def _run_code(
    code: str,
    language: str,
    session_id: str,
    timeout: int | None = None,
    project_path: str = "",
    title: str = "",
) -> dict:
    cwd, artifacts_dir = _resolve_dirs(session_id, project_path)
    artifact_root = (Path(project_path).expanduser() / PROJECT_ARTIFACTS_SUBDIR) if project_path else ARTIFACTS_DIR
    timeout = timeout or settings.sandbox_timeout

    if language == "r":
        cmd = [settings.r_executable]
    else:
        cmd = [settings.python_executable]

    # The script lives in the module's Script directory so it never clutters the
    # project root, but the process runs with cwd == project root when bound.
    script_dir = artifacts_dir / "Script"
    script_dir.mkdir(parents=True, exist_ok=True)
    script_path = _next_script_path(script_dir, code, language, title)
    script_path.write_text(code, encoding="utf-8")
    script_rel = _artifact_relpath(script_path, artifact_root)
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
        # subprocess may yield None for stdout/stderr on some Windows code paths
        # (e.g. truncated/captured streams). Coerce to str so downstream string
        # concatenation never raises "unsupported operand type(s) for +".
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        returncode = proc.returncode
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {timeout}s and was terminated.",
            "returncode": -1,
            "files": [script_rel],
            "artifact_review": _review_artifacts(artifact_root, [script_rel]),
            "env_snapshot": "",
            "workdir": str(cwd),
            "artifact_dir": str(artifacts_dir),
        }
    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": f"Interpreter not found: {cmd[0]}. Check settings or install the runtime.",
            "returncode": -1,
            "files": [script_rel],
            "artifact_review": _review_artifacts(artifact_root, [script_rel]),
            "env_snapshot": "",
            "workdir": str(cwd),
            "artifact_dir": str(artifacts_dir),
        }

    after = _top_entries(cwd)
    created = after - before
    # Gather artifacts the agent wrote into the project root and move them into
    # the per-session artifacts dir. External absolute-path files mentioned in
    # stdout/stderr are copied in too so the artifact panel can preview them.
    new_files: list[str] = [script_rel]
    for src in _iter_created_artifact_files(cwd, created):
        category = _category_dir(src)
        dst_dir = artifacts_dir / category
        dst_dir.mkdir(parents=True, exist_ok=True)
        try:
            if src.resolve().parent == dst_dir.resolve():
                rel = _artifact_relpath(src, artifact_root)
                if rel not in new_files:
                    new_files.append(rel)
                continue
        except Exception:
            pass
        dst = _unique_dest(dst_dir / src.name)
        try:
            shutil.move(str(src), str(dst))
            rel = _artifact_relpath(dst, artifact_root)
            new_files.append(rel)
            logger.info(f"[executor] gathered artifact: {src.name} -> {dst}")
        except Exception as exc:
            logger.warning(f"[executor] failed to gather {src}: {exc}")

    external = _scan_external_files(stdout + stderr, ARTIFACT_EXTS, cwd)
    for src_path in external:
        try:
            src = Path(src_path)
            dst_dir = artifacts_dir / _category_dir(src)
            dst_dir.mkdir(parents=True, exist_ok=True)
            dst = _unique_dest(dst_dir / src.name)
            shutil.copy2(src_path, dst)
            rel = _artifact_relpath(dst, artifact_root)
            if rel not in new_files:
                new_files.append(rel)
            logger.info(f"[executor] copied external artifact: {src_path} -> {rel}")
        except Exception as exc:
            logger.warning(f"[executor] failed to copy external artifact {src_path}: {exc}")

    artifact_review = _review_artifacts(artifact_root, new_files)

    return {
        "stdout": stdout,
        "stderr": stderr,
        "returncode": returncode,
        "files": new_files,
        "artifact_review": artifact_review,
        "env_snapshot": _env_snapshot(language),
        "workdir": str(cwd),
        "artifact_dir": str(artifacts_dir),
    }


def _iter_created_artifact_files(cwd: Path, created: set[str]) -> list[Path]:
    files: list[Path] = []
    try:
        artifact_root = (cwd / PROJECT_ARTIFACTS_SUBDIR).resolve()
    except Exception:
        artifact_root = None
    for name in sorted(created):
        src = cwd / name
        candidates = [src] if src.is_file() else sorted([p for p in src.rglob("*") if p.is_file()]) if src.is_dir() else []
        for candidate in candidates:
            if candidate.suffix.lower() not in {item.lower() for item in ARTIFACT_EXTS}:
                continue
            if artifact_root:
                try:
                    candidate.resolve().relative_to(artifact_root)
                    continue
                except ValueError:
                    pass
            files.append(candidate)
    return files


def _scan_external_files(output: str, exts: set, workdir: Path) -> list:
    import re

    pattern = re.compile(
        r'(([A-Za-z]:[\\/][^\s:<>|*?"\']+)|(?:/[^\s:<>|*?"\']+))'
        r'\.(?:png|jpg|jpeg|svg|pdf|tiff?|csv|tsv|xlsx|xls|txt|md|html|h5ad|h5|json|npy|npz|pkl|parquet)',
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


def _review_artifacts(artifact_root: Path, files: list[str]) -> list[str]:
    notes: list[str] = []
    for rel in files:
        path = artifact_root / rel
        if not path.exists() or not path.is_file():
            continue
        category = _category_dir(path)
        size_kb = path.stat().st_size / 1024
        if category == "Figure":
            notes.append(_review_figure(path, rel, size_kb))
        elif category == "Table":
            notes.append(_review_table(path, rel, size_kb))
        elif category == "Script":
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            notes.append(f"{rel}: script captured ({line_count} lines, {size_kb:.1f} KB).")
        elif category == "Data":
            notes.append(f"{rel}: data artifact captured ({size_kb:.1f} KB).")
        else:
            notes.append(f"{rel}: document/file artifact captured ({size_kb:.1f} KB).")
    return notes


def _review_figure(path: Path, rel: str, size_kb: float) -> str:
    if path.suffix.lower() == ".pdf":
        return f"{rel}: visual review pending, figure-like PDF captured ({size_kb:.1f} KB); raster check unavailable."
    if path.suffix.lower() == ".svg":
        text = path.read_text(encoding="utf-8", errors="ignore")
        status = "nonempty" if "<svg" in text.lower() and len(text.strip()) > 200 else "needs check"
        return f"{rel}: visual review, SVG {status} ({size_kb:.1f} KB)."
    try:
        from PIL import Image, ImageStat

        with Image.open(path) as image:
            width, height = image.size
            gray = image.convert("L")
            stat = ImageStat.Stat(gray)
            extrema = gray.getextrema()
            stddev = stat.stddev[0] if stat.stddev else 0
            blank = extrema[0] == extrema[1] or stddev < 1.0
            size_note = "low resolution" if width < 500 or height < 350 else "resolution ok"
            blank_note = "blank/near-blank warning" if blank else "nonblank"
            return f"{rel}: visual review, {width}x{height}px, {blank_note}, {size_note}, {size_kb:.1f} KB."
    except Exception as exc:
        return f"{rel}: visual review failed, image captured ({size_kb:.1f} KB): {exc}."


def _review_table(path: Path, rel: str, size_kb: float) -> str:
    ext = path.suffix.lower()
    if ext not in {".csv", ".tsv"}:
        return f"{rel}: table/data file captured ({size_kb:.1f} KB)."
    delimiter = "\t" if ext == ".tsv" else ","
    try:
        with path.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
            rows = csv_reader(handle, delimiter=delimiter)
            header = next(rows, [])
            row_count = sum(1 for _ in rows)
        col_count = len(header) if header else 0
        return f"{rel}: table captured ({row_count} rows x {col_count} columns, {size_kb:.1f} KB)."
    except Exception as exc:
        return f"{rel}: table captured ({size_kb:.1f} KB), shape check failed: {exc}."


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
            result = _run_code(code, language, sid, project_path=project_path, title=args.get("title", ""))
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
    review = result.get("artifact_review") or []
    review_line = "\n--- artifact review ---\n" + "\n".join(review) + "\n" if review else ""
    artifact_dir = f"\nArtifact directory: {result.get('artifact_dir')}" if result.get("artifact_dir") else ""
    return (
        f"[execution {status}]\n"
        f"Working directory: {result.get('workdir', '')}{artifact_dir}\n"
        f"--- stdout ---\n{result['stdout']}\n"
        + (f"--- stderr ---\n{result['stderr']}\n" if result["stderr"] else "")
        + review_line
        + files_line
    )


def _persist_artifact(session_id: str, language: str, code: str, result: dict, title: str, project_path: str = ""):
    from ..db.database import SessionLocal
    from ..db.models import Artifact

    db = SessionLocal()
    try:
        review = result.get("artifact_review") or []
        review_text = "\n\n--- artifact review ---\n" + "\n".join(review) if review else ""
        artifact = Artifact(
            id=uuid.uuid4().hex,
            session_id=session_id,
            kind=_artifact_kind(result["files"]),
            title=title or f"{language} execution artifact",
            language=language,
            code=code,
            output=result["stdout"] + ("\n" + result["stderr"] if result["stderr"] else "") + review_text,
            files=result["files"],
            env_snapshot=result.get("env_snapshot", ""),
            project_path=project_path or "",
        )
        db.add(artifact)
        db.commit()
    finally:
        db.close()


def _artifact_kind(files: list[str]) -> str:
    suffixes = {Path(name).suffix.lower() for name in files}
    if suffixes & {item.lower() for item in FIGURE_EXTS}:
        return "figure"
    if suffixes & {item.lower() for item in TABLE_EXTS}:
        return "table"
    if suffixes & {item.lower() for item in SCRIPT_EXTS}:
        return "code"
    return "file"
