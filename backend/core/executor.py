"""Code sandbox and tool execution helpers."""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
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
    "structure": "structure-biology",
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
STRUCTURE_EXTS = {".pdb", ".ent", ".cif", ".mmcif", ".mol", ".sdf", ".mol2", ".pdbqt"}
DOCUMENT_EXTS = {".txt", ".md", ".html", ".htm"}
ARTIFACT_EXTS = FIGURE_EXTS | TABLE_EXTS | DATA_EXTS | SCRIPT_EXTS | STRUCTURE_EXTS | DOCUMENT_EXTS
_SCRIPT_SEQUENCE_LOCK = threading.Lock()


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip().lower()).strip("-._")
    return slug or "session"


def _session_scope_parts(session_id: str) -> tuple[str, str]:
    """Return ``(module_slug, session_subdir)`` for a session's artifact folder.

    Each session gets its own subfolder so two sessions of the same module no
    longer share one directory (which caused file collisions and confusing
    sequence numbers). The subfolder name is the session *title* slug — the
    title is derived from the first user message (see ``_maybe_update_title``),
    so the folder reads like "bulk-rnaseq-day3" rather than an opaque id. When
    there is no title yet (brand-new session, default "New Session"), we fall
    back to the first 8 chars of the session id so the very first code run has
    a stable, unique home.
    """
    module_slug = _safe_slug(session_id)
    session_subdir = session_id[:8]
    try:
        from ..db.database import SessionLocal
        from ..db.models import Session as SessionModel

        db = SessionLocal()
        try:
            session = db.query(SessionModel).get(session_id)
            if session:
                module_slug = SESSION_MODE_SLUGS.get(session.mode or "", _safe_slug(session.mode or ""))
                title = (session.title or "").strip()
                # Default placeholder titles mean the user hasn't sent
                # anything yet — keep the short-id fallback in that case.
                if title and title not in {"New Session", "\u65b0\u4f1a\u8bdd"}:
                    session_subdir = _safe_slug(title)[:60]
        finally:
            db.close()
    except Exception:
        pass
    return module_slug, session_subdir


def _session_artifact_scope(session_id: str) -> str:
    """Legacy single-string scope, kept for any older callers.

    Returns ``module/session-subdir`` so the path still nests under the module
    folder the way callers expect. Prefer :func:`_session_scope_parts` directly.
    """
    module_slug, session_subdir = _session_scope_parts(session_id)
    return f"{module_slug}/{session_subdir}"


def _category_dir(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {item.lower() for item in FIGURE_EXTS}:
        return "Figure"
    if ext in {item.lower() for item in TABLE_EXTS}:
        return "Table"
    if ext in {item.lower() for item in SCRIPT_EXTS}:
        return "Script"
    if ext in {item.lower() for item in STRUCTURE_EXTS}:
        return "Structure"
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
    path, lock_path = _reserve_next_script_path(script_dir, code, language, title)
    _release_sequence_lock(lock_path)
    return path


def _write_next_script(script_dir: Path, code: str, language: str, title: str = "") -> Path:
    path, lock_path = _reserve_next_script_path(script_dir, code, language, title)
    try:
        path.write_text(code, encoding="utf-8")
        return path
    finally:
        _release_sequence_lock(lock_path)


def _reserve_next_script_path(script_dir: Path, code: str, language: str, title: str = "") -> tuple[Path, Path | None]:
    ext = ".R" if language == "r" else ".py"
    slug = _script_slug(code, title)
    with _SCRIPT_SEQUENCE_LOCK:
        for seq in range(_next_sequence(script_dir), 10000):
            if _sequence_in_use(script_dir, seq):
                continue
            lock_path = script_dir / f".{seq:02d}.seq"
            try:
                fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
            except FileExistsError:
                continue
            except OSError:
                lock_path = None

            if _sequence_file_exists(script_dir, seq):
                _release_sequence_lock(lock_path)
                continue

            path = script_dir / f"{seq:02d}_{slug}{ext}"
            try:
                fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                return path, lock_path
            except FileExistsError:
                _release_sequence_lock(lock_path)
                continue
            except OSError:
                _release_sequence_lock(lock_path)
                continue

    path = script_dir / f"{uuid.uuid4().hex[:8]}_{slug}{ext}"
    return _unique_dest(path), None


def _next_sequence(script_dir: Path) -> int:
    max_seen = 0
    for path in script_dir.glob("*"):
        match = re.match(r"^(\d+)_", path.name)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
            continue
        lock_match = re.match(r"^\.(\d+)\.seq$", path.name)
        if lock_match:
            max_seen = max(max_seen, int(lock_match.group(1)))
    return max_seen + 1


def _sequence_in_use(script_dir: Path, seq: int) -> bool:
    prefix = f"{seq:02d}_"
    lock_name = f".{seq:02d}.seq"
    try:
        return any(path.name.startswith(prefix) or path.name == lock_name for path in script_dir.iterdir())
    except Exception:
        return False


def _sequence_file_exists(script_dir: Path, seq: int) -> bool:
    prefix = f"{seq:02d}_"
    try:
        return any(path.name.startswith(prefix) for path in script_dir.iterdir())
    except Exception:
        return False


def _release_sequence_lock(lock_path: Path | None):
    if not lock_path:
        return
    try:
        lock_path.unlink(missing_ok=True)
    except Exception:
        pass


def _discard_generated_script(path: Path) -> None:
    """Remove a failed generated script draft from the durable artifact surface."""
    try:
        path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning(f"[executor] could not discard failed generated script {path}: {exc}")


def _script_slug(code: str, title: str = "") -> str:
    title = (title or "").strip()
    generic = {"run", "script", "code", "analysis", "plot", "figure", "python execution artifact", "r execution artifact"}
    if title and title.lower() not in generic:
        title_slug = _strip_leading_sequence(_safe_slug(title))
        if title_slug != "session":
            return title_slug[:64]

    purpose = _derive_script_purpose(code)
    purpose_slug = _strip_leading_sequence(_safe_slug(purpose))
    if purpose_slug == "session":
        return "analysis_script"
    return purpose_slug[:64]


def _strip_leading_sequence(slug: str) -> str:
    cleaned = re.sub(r"^\d{1,3}[-_.]+", "", slug or "").strip("-._")
    return cleaned or slug or "analysis_script"


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


def _looks_like_missing_file_error(output: str) -> bool:
    """Heuristic: does this run output mention a file-not-found style error?

    Matches the common phrasings from Python/R (FileNotFoundError, No such
    file or directory, 'foo.h5ad', cannot open file, file does not exist).
    """
    text = (output or "").lower()
    needles = (
        "filenotfounderror",
        "no such file or directory",
        "file does not exist",
        "cannot open file",
        "unable to open file",
        "no file named",
        "does not exist in the file system",
        "errno 2",
    )
    return any(n in text for n in needles)


def _extract_missing_filenames(output: str) -> list[str]:
    """Best-effort extraction of file basenames a missing-file error refers to."""
    # Capture quoted paths or filenames with a known artifact extension.
    pattern = re.compile(
        r"""['"]?([A-Za-z0-9._\-/\\]+\.(?:h5ad|h5|csv|tsv|xlsx|parquet|json|npy|npz|pkl|txt|md|png|jpg|jpeg|svg|pdf|tif|tiff|pdb|ent|cif|mmcif|mol|sdf|mol2|pdbqt))['"]?""",
        re.IGNORECASE,
    )
    names: list[str] = []
    for match in pattern.finditer(output or ""):
        candidate = match.group(1).replace("\\", "/").split("/")[-1]
        if candidate and candidate not in names:
            names.append(candidate)
    return names[:10]


def _recover_missing_files(cwd: Path, artifacts_dir: Path, output: str) -> list[str]:
    """Link previous-step outputs referenced-but-missing into the cwd.

    Returns the list of basenames that were recovered. Uses symlinks on POSIX
    and copies on Windows (symlinks need privilege there). Only links files
    that actually exist somewhere under the session artifacts dir.
    """
    wanted = _extract_missing_filenames(output)
    if not wanted:
        return []
    # Search the session's artifact tree for those basenames.
    pool: dict[str, Path] = {}
    if artifacts_dir.exists():
        for path in artifacts_dir.rglob("*"):
            if path.is_file() and path.name in wanted:
                pool.setdefault(path.name, path)
    recovered: list[str] = []
    for name in wanted:
        src = pool.get(name)
        if not src:
            continue
        dst = cwd / name
        if dst.exists():
            continue
        try:
            # Prefer symlink (cheap, reflects the real source); fall back to copy.
            try:
                os.symlink(src.resolve(), dst)
            except (OSError, NotImplementedError):
                shutil.copy2(src, dst)
            recovered.append(name)
        except Exception as exc:
            logger.warning(f"[executor] could not recover {name} into cwd: {exc}")
    return recovered


def _resolve_dirs(session_id: str, project_path: str = "") -> tuple[Path, Path]:
    """Return (cwd, artifacts_dir) for a session.

    Design: the agent runs code with cwd == the project root, so it can freely
    read any file in the project via plain relative paths (e.g.
    ``pd.read_csv("data.csv")``). Generated artifacts are then gathered into a
    per-session subfolder such as
    ``<project>/artifacts/bio-analysis/bulk-rnaseq-day3/Figure/`` so two
    sessions of the same module never share or clobber each other's outputs.
    The folder name is the session title slug (first-message summary) with a
    short-id fallback for brand-new sessions.

    When no project folder is bound, both cwd and artifacts_dir collapse to the
    global ``ARTIFACTS_DIR/<module>/<session-subdir>`` location.
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


_ENV_SNAPSHOT_MAX_CHARS = 4000


def _env_snapshot(language: str) -> str:
    try:
        if language == "r":
            r_exe = shutil.which(settings.r_executable)
            if not r_exe:
                return "R not found"
            proc = subprocess.run([r_exe, "--version"], capture_output=True, text=True, timeout=15)
            text = (proc.stdout or "") + (proc.stderr or "")
            return text[:_ENV_SNAPSHOT_MAX_CHARS]

        proc = subprocess.run(
            [settings.python_executable, "-m", "pip", "freeze"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        text = f"{sys.version}\n\n{proc.stdout or ''}"
        return text[:_ENV_SNAPSHOT_MAX_CHARS]
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
    script_path = _write_next_script(script_dir, code, language, title)
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

    # Scrub secrets (LLM_API_KEY, ...) from the child env so a generated
    # script cannot exfiltrate credentials by accident. The agent runs with a
    # reduced environment that still has PATH, MPLBACKEND, etc.
    from .sandbox import MemoryWatcher, kill_process_tree, scrubbed_env

    env = scrubbed_env(os.environ)
    env["MPLBACKEND"] = "Agg"
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
    except FileNotFoundError:
        _discard_generated_script(script_path)
        return {
            "stdout": "",
            "stderr": f"Interpreter not found: {cmd[0]}. Check settings or install the runtime.",
            "returncode": -1,
            "files": [],
            "discarded_files": [script_rel],
            "artifact_review": [],
            "env_snapshot": "",
            "workdir": str(cwd),
            "artifact_dir": str(artifacts_dir),
        }

    # Memory watcher: best-effort cap on resident set. psutil optional.
    watcher = MemoryWatcher([proc], settings.sandbox_memory_mb).start()

    try:
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            # Kill the *whole* process tree so a parent script cannot leave
            # orphaned children behind (default run() only kills the direct
            # child). Then drain whatever output was buffered.
            kill_process_tree(proc)
            try:
                stdout, stderr = proc.communicate(timeout=5)
            except Exception:
                stdout, stderr = "", ""
            stderr = (stderr or "") + f"\nExecution timed out after {timeout}s and was terminated."
            _discard_generated_script(script_path)
            returncode = -1
            discarded = [script_rel]
            return {
                "stdout": stdout or "",
                "stderr": stderr or "",
                "returncode": returncode,
                "files": [],
                "discarded_files": discarded,
                "artifact_review": [],
                "env_snapshot": _env_snapshot(language),
                "workdir": str(cwd),
                "artifact_dir": str(artifacts_dir),
            }
        else:
            returncode = proc.returncode
    finally:
        watcher.stop()

    # subprocess may yield None for stdout/stderr on some Windows code paths
    # (e.g. truncated/captured streams). Coerce to str so downstream string
    # concatenation never raises "unsupported operand type(s) for +".
    stdout = stdout or ""
    stderr = stderr or ""

    # ---- Auto-recovery for missing-file errors (defence in depth) ----------
    # If the run failed because it referenced a file that an earlier step saved
    # into this session's Data/Table/etc. folder (the classic "step N saved to
    # artifacts/.../Data/foo.h5ad, step N+1 read bare foo.h5ad from the project
    # root" footgun), link the missing files into the cwd and retry once. The
    # primary fix is the harness-core skill telling the agent to use the real
    # path; this catches the case where the agent does not self-heal.
    if returncode != 0 and _looks_like_missing_file_error(stderr + "\n" + stdout):
        recovered = _recover_missing_files(cwd, artifacts_dir, stderr + "\n" + stdout)
        if recovered:
            logger.info(f"[executor] auto-recovered missing files: {recovered}; retrying once")
            try:
                proc2 = subprocess.Popen(
                    cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env,
                )
            except FileNotFoundError:
                proc2 = None
            if proc2 is not None:
                w2 = MemoryWatcher([proc2], settings.sandbox_memory_mb).start()
                try:
                    try:
                        stdout, stderr = proc2.communicate(timeout=timeout)
                    except subprocess.TimeoutExpired:
                        kill_process_tree(proc2)
                        try:
                            stdout, stderr = proc2.communicate(timeout=5)
                        except Exception:
                            stdout, stderr = "", ""
                        stderr = (stderr or "") + f"\nExecution timed out after {timeout}s and was terminated."
                        returncode = -1
                    else:
                        returncode = proc2.returncode
                finally:
                    w2.stop()
                stdout = stdout or ""
                stderr = stderr or ""
                if returncode == 0:
                    stderr = (
                        (stderr + "\n" if stderr else "")
                        + f"[executor] note: run succeeded after auto-recovering missing files ({', '.join(recovered)}); "
                        "tell the agent to use the artifacts/<module>/<session>/... path next time."
                    )

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

    discarded_files: list[str] = []
    if returncode != 0 and script_rel in new_files:
        _discard_generated_script(script_path)
        new_files = [rel for rel in new_files if rel != script_rel]
        discarded_files.append(script_rel)

    artifact_review = _review_artifacts(artifact_root, new_files)

    return {
        "stdout": stdout,
        "stderr": stderr,
        "returncode": returncode,
        "files": new_files,
        "discarded_files": discarded_files,
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
        r'\.(?:png|jpg|jpeg|svg|pdf|tiff?|csv|tsv|xlsx|xls|txt|md|html|h5ad|h5|json|npy|npz|pkl|parquet|pdb|ent|cif|mmcif|mol|sdf|mol2|pdbqt)',
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
        elif category == "Structure":
            notes.append(_review_structure(path, rel, size_kb))
        elif category == "Data":
            notes.append(_review_data(path, rel, size_kb))
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


def _review_data(path: Path, rel: str, size_kb: float) -> str:
    """Summarize a data artifact (h5ad/npy/npz/pkl) by shape/dtype when cheap.

    Reading binary scientific formats can be slow or require heavy deps, so we
    only attempt the cheap numpy path (.npy/.npz) and fall back to a size note.
    """
    ext = path.suffix.lower()
    if ext in {".npy", ".npz"}:
        try:
            import numpy as np

            if ext == ".npy":
                arr = np.load(path, allow_pickle=False)
                return f"{rel}: data captured (numpy {arr.shape} {arr.dtype}, {size_kb:.1f} KB)."
            with np.load(path, allow_pickle=False) as data:
                shapes = ", ".join(f"{k}={data[k].shape}" for k in data.files[:5])
                return f"{rel}: data captured (npz {shapes}, {size_kb:.1f} KB)."
        except Exception as exc:
            return f"{rel}: data artifact captured ({size_kb:.1f} KB), shape check failed: {exc}."
    if ext in {".h5ad", ".h5"}:
        try:
            import h5py

            with h5py.File(path, "r") as handle:
                keys = list(handle.keys())[:5]
                return f"{rel}: data captured (h5 keys={keys}, {size_kb:.1f} KB)."
        except Exception:
            return f"{rel}: data artifact captured ({size_kb:.1f} KB)."
    return f"{rel}: data artifact captured ({size_kb:.1f} KB)."


def _review_structure(path: Path, rel: str, size_kb: float) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        return f"{rel}: structure artifact captured ({size_kb:.1f} KB), preview read failed: {exc}."

    ext = path.suffix.lower()
    atom_count = 0
    chain_ids: set[str] = set()
    if ext in {".pdb", ".ent", ".pdbqt"}:
        for line in text.splitlines():
            if not line.startswith(("ATOM", "HETATM")):
                continue
            atom_count += 1
            chain = line[21:22].strip()
            if chain:
                chain_ids.add(chain)
    elif ext in {".cif", ".mmcif"}:
        for line in text.splitlines():
            stripped = line.lstrip()
            if stripped.startswith(("ATOM ", "HETATM ")):
                atom_count += 1
                parts = stripped.split()
                if len(parts) > 6:
                    chain_ids.add(parts[6])
    elif ext == ".mol2":
        in_atoms = False
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.upper().startswith("@<TRIPOS>ATOM"):
                in_atoms = True
                continue
            if stripped.upper().startswith("@<TRIPOS>") and in_atoms:
                break
            if in_atoms and stripped:
                atom_count += 1
    elif ext in {".mol", ".sdf"}:
        lines = text.splitlines()
        if len(lines) >= 4:
            try:
                atom_count = int(lines[3][:3])
            except Exception:
                atom_count = 0

    chain_note = f", chains={sorted(chain_ids)[:8]}" if chain_ids else ""
    if atom_count:
        return f"{rel}: structure captured ({atom_count} atoms{chain_note}, {size_kb:.1f} KB); 3D preview available in Artifacts."
    return f"{rel}: structure file captured ({size_kb:.1f} KB); atom-coordinate preview may need inspection."


def _review_table(path: Path, rel: str, size_kb: float) -> str:
    ext = path.suffix.lower()
    if ext not in {".csv", ".tsv"}:
        return f"{rel}: table/data file captured ({size_kb:.1f} KB)."
    delimiter = "\t" if ext == ".tsv" else ","
    try:
        with path.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
            rows = csv_reader(handle, delimiter=delimiter)
            header = next(rows, [])
            preview_rows = []
            for idx, row in enumerate(rows):
                if idx >= 8:
                    break
                preview_rows.append(row)
            # finish counting remaining rows for the shape note
            row_count = len(preview_rows) + sum(1 for _ in rows) + (1 if header else 0) - 1
        col_count = len(header) if header else 0
        note = f"{rel}: table captured ({row_count} rows x {col_count} columns, {size_kb:.1f} KB)."
        # Embed a small CSV preview the artifact panel renders as a table.
        # Marker fence ```sw-table ... ``` is parsed by the frontend.
        lines = [",".join(header)] + [",".join(r) for r in preview_rows]
        preview_block = "```sw-table\n" + "\n".join(lines) + "\n```"
        return note + "\n" + preview_block
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
            # Run the (blocking, subprocess-based) sandbox off the event loop so
            # a long Python/R execution cannot freeze concurrent sessions or the
            # SSE heartbeat for other agents. This is the main fix for the
            # "switching agents stalls while code runs" symptom.
            import asyncio

            result = await asyncio.to_thread(
                _run_code, code, language, sid, project_path=project_path, title=args.get("title", "")
            )
            try:
                await asyncio.to_thread(
                    _persist_artifact, sid, language, code, result, args.get("title", ""), project_path
                )
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


def _extract_error_summary(stdout: str, stderr: str) -> str:
    """Pull the actionable error signal out of a Python/R traceback.

    Models often have to read a 100-line scanpy traceback to find the one
    ``KeyError: 'RPL41'`` that matters. This extracts the exception type +
    message + the user-script frame (file:line) and returns a short header.
    Empty when the run looks successful (no exception line found).
    """
    text = f"{stderr}\n{stdout}"
    if not text.strip():
        return ""
    # Python: last "XxxError: message" line + its "File ..., line N" frame.
    py_exc = re.findall(
        r"^([A-Z][A-Za-z_]*?(?:Error|Exception|Warning)):\s*(.*)$",
        text, re.MULTILINE,
    )
    if py_exc:
        exc_type, msg = py_exc[-1][0], py_exc[-1][1]
        # Find the script frame (the user's run_NN.py), not library internals.
        frame_lines = re.findall(
            r'File "[^"]*?(run_[A-Za-z0-9]+\.(?:py|R))", line (\d+)',
            text,
        )
        frame = f' (at {frame_lines[-1][0]}:{frame_lines[-1][1]})' if frame_lines else ''
        hint = ""
        low = text.lower()
        # Common, fixable single-cell failure patterns — give the model a leg up.
        if "keyerror" in low and ("var_names" in low or "obs_names" in low or "gene" in low):
            hint = " — a gene/feature is not in the current adata variable space (often after HVG subsetting). Re-check adata.var_names / use adata.raw.var_names or filter to genes that exist before plotting."
        elif "valueerror" in low and ("must be the same" in low or "shape" in low):
            hint = " — shape/dimension mismatch; align the objects you are passing."
        return f"[ERROR SUMMARY] {exc_type}: {msg}{frame}{hint}"
    # R: "Error in ... : message"
    r_exc = re.findall(r"^Error(?: in [^:]+)?:\s*(.+)$", text, re.MULTILINE)
    if r_exc:
        return f"[ERROR SUMMARY] R error: {r_exc[-1]}"
    return ""


def _format_run_result(result: dict) -> str:
    status = "success" if result["returncode"] == 0 else f"return code {result['returncode']}"
    files_line = f"\nArtifact files: {', '.join(result['files'])}" if result["files"] else ""
    discarded = result.get("discarded_files") or []
    discarded_line = f"\nDiscarded failed generated scripts: {', '.join(discarded)}" if discarded else ""
    review = result.get("artifact_review") or []
    review_line = "\n--- artifact review ---\n" + "\n".join(review) + "\n" if review else ""
    artifact_dir = f"\nArtifact directory: {result.get('artifact_dir')}" if result.get("artifact_dir") else ""
    # On failure, surface a short structured error summary at the very top so
    # the model sees the real cause (exception type + message + script line)
    # before wading through the full stdout/stderr. This is the difference
    # between "model reads 100 lines and guesses wrong" and "model sees
    # KeyError: 'RPL41' (at run_03.py:42) immediately".
    error_summary = ""
    if result["returncode"] != 0:
        error_summary = _extract_error_summary(result.get("stdout", ""), result.get("stderr", ""))
        if error_summary:
            error_summary = error_summary + "\n"
    return (
        f"[execution {status}]\n"
        f"{error_summary}"
        f"Working directory: {result.get('workdir', '')}{artifact_dir}\n"
        f"--- stdout ---\n{result['stdout']}\n"
        + (f"--- stderr ---\n{result['stderr']}\n" if result["stderr"] else "")
        + review_line
        + files_line
        + discarded_line
    )


_ARTIFACT_OUTPUT_MAX_CHARS = 200_000


def _persist_artifact(session_id: str, language: str, code: str, result: dict, title: str, project_path: str = ""):
    from ..db.database import SessionLocal
    from ..db.models import Artifact

    db = SessionLocal()
    try:
        review = result.get("artifact_review") or []
        review_text = "\n\n--- artifact review ---\n" + "\n".join(review) if review else ""
        raw_output = result["stdout"] + ("\n" + result["stderr"] if result["stderr"] else "") + review_text
        # Cap the persisted output so a runaway script printing gigabytes
        # cannot bloat the SQLite database. The head is the most useful part
        # for the user; the tail is appended when truncation occurs.
        truncated = len(raw_output) > _ARTIFACT_OUTPUT_MAX_CHARS
        if truncated:
            head = raw_output[: _ARTIFACT_OUTPUT_MAX_CHARS // 2]
            tail = raw_output[-_ARTIFACT_OUTPUT_MAX_CHARS // 2 :]
            output = (
                head
                + f"\n\n[... output truncated: {len(raw_output) - _ARTIFACT_OUTPUT_MAX_CHARS} chars omitted ...]\n\n"
                + tail
            )
        else:
            output = raw_output
        artifact = Artifact(
            id=uuid.uuid4().hex,
            session_id=session_id,
            kind=_artifact_kind(result["files"]),
            title=title or f"{language} execution artifact",
            language=language,
            code=code,
            output=output,
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
    if suffixes & {item.lower() for item in STRUCTURE_EXTS}:
        return "file"
    if suffixes & {item.lower() for item in SCRIPT_EXTS}:
        return "code"
    return "file"
