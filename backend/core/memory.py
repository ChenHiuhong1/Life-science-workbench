"""Long-term project memory (AGENTS.md).

Science Workbench supports a CLAUDE.md / AGENTS.md style memory file that lets
the user customize agent behaviour per project. The loader searches a small set
of well-defined locations and concatenates whatever it finds into a single
"Project Memory" block that is injected at the top of every agent's system
prompt.

Lookup order (later entries override earlier ones by *appending*, so the most
specific memory is read last by the model):

1. Global memory at ``APP_HOME/AGENTS.md`` — applies to every project.
2. Backend dev memory at ``backend/AGENTS.md`` — a developer-default that ships
   with the repo.
3. Project-bound folder memory at ``<project_path>/AGENTS.md`` — the primary,
   user-edited per-project memory. This is what most users will use.

Each location is optional. The combined block is cached and only re-read when
any of the resolved files' mtime changes, so editing the file takes effect on
the next message without an app restart.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from loguru import logger

from ..config import APP_HOME, BACKEND_DIR


MEMORY_FILENAME = "AGENTS.md"
_MAX_MEMORY_CHARS = 16_000  # cap so a runaway memory file can't blow the prompt


def _candidate_paths(project_path: str = "") -> List[Path]:
    """Return the ordered list of memory-file locations to look at."""
    paths: List[Path] = [
        APP_HOME / MEMORY_FILENAME,        # global, all projects
        BACKEND_DIR / MEMORY_FILENAME,     # developer default shipped with repo
    ]
    if project_path:
        paths.append(Path(project_path).expanduser() / MEMORY_FILENAME)  # per-project
    return paths


def resolve_memory_files(project_path: str = "") -> List[Path]:
    """Return only the candidate memory files that actually exist."""
    return [p for p in _candidate_paths(project_path) if p.exists() and p.is_file()]


def _fingerprint(files: List[Path]) -> Tuple[Tuple[str, float, int], ...]:
    out: List[Tuple[str, float, int]] = []
    for f in files:
        try:
            st = f.stat()
            out.append((str(f), st.st_mtime, st.st_size))
        except OSError:
            out.append((str(f), 0.0, 0))
    return tuple(out)


# Cache keyed by project_path. Value is (fingerprint, combined_text).
_memory_cache: dict[str, Tuple[Tuple[Tuple[str, float, int], ...], str]] = {}


def load_project_memory(project_path: str = "") -> str:
    """Build and cache the combined memory block for a project.

    Returns an empty string when no memory file is present. The result is
    re-read from disk only when a candidate file's mtime/size changes, so the
    cost per chat request is a single cheap stat per file.
    """
    files = resolve_memory_files(project_path)
    fp = _fingerprint(files)
    cached = _memory_cache.get(project_path)
    if cached and cached[0] == fp:
        return cached[1]

    parts: List[str] = []
    used = 0
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore").strip()
        except OSError as exc:
            logger.warning(f"[memory] failed to read {path}: {exc}")
            continue
        if not text:
            continue
        budget = _MAX_MEMORY_CHARS - used
        if budget <= 0:
            logger.info(f"[memory] budget exhausted before {path}; skipping")
            break
        if len(text) > budget:
            text = text[:budget] + "\n…(truncated)"
        label = "Project memory" if (project_path and Path(project_path).expanduser() in path.parents) else (
            "Global memory" if path.parent == APP_HOME else "Default memory"
        )
        parts.append(f"### {label} ({path.name})\n{text}")
        used += len(text)

    block = "\n\n".join(parts)
    _memory_cache[project_path] = (fp, block)
    return block


def memory_block_for_prompt(project_path: str = "") -> str:
    """Return the memory wrapped as a system-prompt section, or '' if none."""
    block = load_project_memory(project_path)
    if not block:
        return ""
    return (
        "\n\n===== Project Memory (AGENTS.md — user-customized long-term memory) =====\n"
        f"{block}\n"
        "===== End Project Memory =====\n"
        "Treat the memory above as durable user instructions for this project. "
        "It overrides the defaults when they conflict, but a direct user message "
        "in the current turn always wins over memory."
    )


def memory_status(project_path: str = "") -> dict:
    """Return a small status object for surfacing in the UI (settings panel)."""
    files = resolve_memory_files(project_path)
    return {
        "exists": bool(files),
        "paths": [str(p) for p in files],
        "chars": sum(len(p.read_text(encoding="utf-8", errors="ignore")) for p in files),
    }


def invalidate_cache() -> None:
    """Drop all cached memory blocks. Called when a memory file is saved."""
    _memory_cache.clear()
