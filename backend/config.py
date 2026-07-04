"""Application configuration and desktop data paths."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


APP_NAME = "ScienceWorkbench"


def _resource_root() -> Path:
    """Return the directory that contains bundled backend resources."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
RESOURCE_ROOT = _resource_root()
KNOWLEDGE_DIR = RESOURCE_ROOT / "knowledge"
BUNDLED_SKILLS_DIR = RESOURCE_ROOT / "bundled_skills"


def _default_app_home() -> Path:
    override = os.environ.get("SCIENCE_WORKBENCH_HOME")
    if override:
        return Path(override).expanduser()

    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / APP_NAME
        return Path.home() / "AppData" / "Roaming" / APP_NAME

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME

    base = os.environ.get("XDG_DATA_HOME")
    return (Path(base) if base else Path.home() / ".local" / "share") / APP_NAME


APP_HOME = _default_app_home()
DATA_DIR = APP_HOME / "data"
ARTIFACTS_DIR = DATA_DIR / "artifacts"
LOG_DIR = APP_HOME / "logs"
WORKSPACES_DIR = APP_HOME / "workspaces"
ENV_FILE = APP_HOME / ".env"

for d in (APP_HOME, DATA_DIR, ARTIFACTS_DIR, LOG_DIR, WORKSPACES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _migrate_legacy_dev_data() -> None:
    """Copy old source-tree dev data into the desktop app folder once.

    This is intentionally non-destructive: existing files in APP_HOME win.
    """
    legacy_data = BACKEND_DIR / "data"
    if legacy_data.resolve() == DATA_DIR.resolve() or not legacy_data.exists():
        return

    legacy_db = legacy_data / "app.db"
    target_db = DATA_DIR / "app.db"
    if legacy_db.exists() and not target_db.exists():
        shutil.copy2(legacy_db, target_db)

    legacy_artifacts = legacy_data / "artifacts"
    if legacy_artifacts.exists() and not any(ARTIFACTS_DIR.iterdir()):
        shutil.copytree(legacy_artifacts, ARTIFACTS_DIR, dirs_exist_ok=True)

    legacy_env = BACKEND_DIR / ".env"
    if legacy_env.exists() and not ENV_FILE.exists():
        shutil.copy2(legacy_env, ENV_FILE)


_migrate_legacy_dev_data()


SKILLS_NATURE_DIR = Path(
    os.environ.get("SCIENCE_WORKBENCH_USER_SKILLS_DIR", Path.home() / ".agents" / "skills")
)
SKILLS_SUPERPOWERS_DIR = Path(
    os.environ.get(
        "SCIENCE_WORKBENCH_SUPERPOWERS_SKILLS_DIR",
        Path.home() / ".zcode" / "cli" / "plugins" / "cache" / "zcode-plugins-official" / "superpowers" / "5.1.0" / "skills",
    )
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_base_url: str = "https://open.bigmodel.cn/api/paas/v4/"
    llm_api_key: str = ""
    llm_model: str = "glm-4-plus"
    reasoning_effort: str = "auto"

    sandbox_timeout: int = 120
    sandbox_memory_mb: int = 4096
    python_executable: str = "python"
    r_executable: str = "Rscript"

    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]


settings = Settings()


def reload_settings() -> None:
    """Reload settings from the desktop app folder without restarting."""
    if not ENV_FILE.exists():
        return
    try:
        fresh = Settings(_env_file=str(ENV_FILE))
        settings.llm_base_url = fresh.llm_base_url
        settings.llm_api_key = fresh.llm_api_key
        settings.llm_model = fresh.llm_model
        settings.reasoning_effort = fresh.reasoning_effort
        settings.python_executable = fresh.python_executable
        settings.r_executable = fresh.r_executable
        settings.sandbox_timeout = fresh.sandbox_timeout
    except Exception:
        pass
