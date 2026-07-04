"""Settings API."""
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
    return {"ok": True, "app_home": str(APP_HOME)}
