"""Settings API."""
import os
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import APP_HOME, ENV_FILE, WORKSPACES_DIR, reload_settings, settings


router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsOut(BaseModel):
    llm_base_url: str
    llm_model: str
    reasoning_effort: str
    has_api_key: bool
    python_executable: str
    r_executable: str
    sandbox_timeout: int
    app_home: str
    workspaces_dir: str


class SettingsIn(BaseModel):
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    reasoning_effort: Optional[str] = None
    python_executable: Optional[str] = None
    r_executable: Optional[str] = None
    sandbox_timeout: Optional[int] = None


@router.get("/models")
def list_models():
    """Return known models + the effective context window for the current one.

    Used by the chat UI so the context meter shows the *real* window (e.g.
    GLM-5.2 = 128K, GLM-5.2[1m] = 1M) instead of a hard-coded value.
    """
    from ..core.model_specs import get_model_spec, list_known_models, context_window_for
    reload_settings()
    model = settings.llm_model
    spec = get_model_spec(model)
    return {
        "current": model,
        "current_context_window": context_window_for(model),
        "current_max_output_tokens": spec.max_output_tokens,
        "current_supports_reasoning_effort": spec.supports_reasoning_effort,
        "current_supports_long_context": spec.long_context_window is not None,
        "models": list_known_models(),
    }


@router.get("", response_model=SettingsOut)
def get_settings():
    reload_settings()
    return SettingsOut(
        llm_base_url=settings.llm_base_url,
        llm_model=settings.llm_model,
        reasoning_effort=settings.reasoning_effort,
        has_api_key=bool(settings.llm_api_key),
        python_executable=settings.python_executable,
        r_executable=settings.r_executable,
        sandbox_timeout=settings.sandbox_timeout,
        app_home=str(APP_HOME),
        workspaces_dir=str(WORKSPACES_DIR),
    )


@router.post("")
def save_settings(inp: SettingsIn):
    lines: list[str] = []
    env_map: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, _, value = line.partition("=")
                env_map[key.strip()] = value
            lines.append(line)

    updates = {
        "LLM_BASE_URL": inp.llm_base_url,
        "LLM_API_KEY": inp.llm_api_key,
        "LLM_MODEL": inp.llm_model,
        "REASONING_EFFORT": inp.reasoning_effort,
        "PYTHON_EXECUTABLE": inp.python_executable,
        "R_EXECUTABLE": inp.r_executable,
        "SANDBOX_TIMEOUT": str(inp.sandbox_timeout) if inp.sandbox_timeout else None,
    }
    runtime_fields = {
        "LLM_BASE_URL": "llm_base_url",
        "LLM_API_KEY": "llm_api_key",
        "LLM_MODEL": "llm_model",
        "REASONING_EFFORT": "reasoning_effort",
        "PYTHON_EXECUTABLE": "python_executable",
        "R_EXECUTABLE": "r_executable",
        "SANDBOX_TIMEOUT": "sandbox_timeout",
    }

    for key, value in updates.items():
        if value is None:
            continue
        if key in env_map:
            lines = [f"{key}={value}" if line.startswith(f"{key}=") else line for line in lines]
        else:
            lines.append(f"{key}={value}")
        field = runtime_fields[key]
        setattr(settings, field, int(value) if field == "sandbox_timeout" else value)

    ENV_FILE.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    _harden_env_permissions()
    _invalidate_runtime_caches()
    return {"ok": True, "app_home": str(APP_HOME)}


def _harden_env_permissions() -> None:
    """Tighten the .env file permissions to owner-only when the OS supports it.

    Windows ignores POSIX mode bits (the file ACL governs access instead), so
    the ``chmod`` is a no-op there; on Linux/macOS it makes the secrets file
    0600. This is best-effort and never fails the save.
    """
    try:
        os.chmod(ENV_FILE, 0o600)
    except Exception:
        pass


def _invalidate_runtime_caches() -> None:
    """Drop memoised values derived from settings so a save takes effect at once."""
    try:
        from ..core import llm as _llm
        _llm._ANTHROPIC_CACHE.clear()
    except Exception:
        pass


@router.delete("/api-key")
def clear_api_key():
    """Wipe the stored LLM API key from .env and memory.

    Keeps all other settings (base url, model, executables). Used by the
    Settings panel "Clear API Key" button. The in-memory ``settings`` object is
    reset so the next request sees an empty key without a process restart.
    """
    lines: list[str] = []
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("LLM_API_KEY="):
                lines.append("LLM_API_KEY=")
                continue
            lines.append(line)
    else:
        lines.append("LLM_API_KEY=")
    ENV_FILE.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    _harden_env_permissions()
    settings.llm_api_key = ""
    _invalidate_runtime_caches()
    return {"ok": True, "has_api_key": False}


# ---------------------------------------------------------------------------
# Long-term memory (AGENTS.md)
# ---------------------------------------------------------------------------
from pathlib import Path as _Path  # noqa: E402
from pydantic import BaseModel as _BaseModel  # noqa: E402


class MemoryOut(_BaseModel):
    exists: bool
    path: str
    content: str


class MemoryIn(_BaseModel):
    project_path: str = ""
    content: str = ""


def _memory_target(project_path: str) -> _Path:
    """Where the per-project AGENTS.md should live (create parent if needed)."""
    if project_path:
        target = _Path(project_path).expanduser() / "AGENTS.md"
    else:
        target = APP_HOME / "AGENTS.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


@router.get("/memory")
def get_memory(project_path: str = ""):
    """Return the effective AGENTS.md content for a project (merged view).

    For editing we surface the most specific file (per-project if a project
    folder is bound, else the global one), creating it empty if missing.
    """
    from ..core.memory import memory_status
    target = _memory_target(project_path)
    content = ""
    if target.exists() and target.is_file():
        try:
            content = target.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            content = ""
    status = memory_status(project_path)
    return {
        "exists": bool(status["exists"]),
        "target_path": str(target),
        "active_paths": status["paths"],
        "chars": status["chars"],
        "content": content,
    }


@router.post("/memory")
def save_memory(inp: MemoryIn):
    """Write (or delete when content is empty) the AGENTS.md memory file."""
    from ..core.memory import invalidate_cache
    target = _memory_target(inp.project_path)
    text = (inp.content or "").strip()
    if not text:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
    else:
        target.write_text(text + "\n", encoding="utf-8")
    invalidate_cache()
    return {"ok": True, "path": str(target), "chars": len(text)}
