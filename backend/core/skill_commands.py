"""Slash/dollar skill command support for chat turns."""
from __future__ import annotations

import io
import re
import shutil
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

from ..config import SKILLS_NATURE_DIR
from . import skills_loader


_COMMAND_RE = re.compile(r"^\s*([/$])([A-Za-z0-9_.-]+)(?:\s+([\s\S]*))?$")
_SKILL_PREFIX_RE = re.compile(r"^\s*([/$])skill(?:\s+([\s\S]*))?$", re.I)
_INSTALL_RE = re.compile(r"^(?:install|add)\s+(\S+)(?:\s+as\s+([A-Za-z0-9_.-]+))?\s*$", re.I)


@dataclass
class SkillCommand:
    kind: str
    skill_name: str = ""
    user_text: str = ""
    message: str = ""
    installed: bool = False


def parse_skill_command(text: str) -> SkillCommand | None:
    """Parse leading /skill, /<name>, $skill, or $<name> commands."""
    raw = text or ""
    prefix = _SKILL_PREFIX_RE.match(raw)
    if prefix:
        body = (prefix.group(2) or "").strip()
        if not body or body.lower() in {"list", "ls"}:
            return SkillCommand(kind="list", message=_format_skill_list())

        install = _INSTALL_RE.match(body)
        if install:
            url = install.group(1)
            alias = install.group(2) or ""
            try:
                name = install_github_skill(url, alias=alias)
                skills_loader.load_all_skills()
                return SkillCommand(
                    kind="install",
                    skill_name=name,
                    installed=True,
                    message=(
                        f"Installed skill `{name}` from {url}.\n\n"
                        f"You can invoke it in a chat turn with `/{name}` or `${name}`."
                    ),
                )
            except Exception as exc:
                logger.exception("[skills] external install failed")
                return SkillCommand(kind="error", message=f"Skill install failed: {exc}")

        name, _, rest = body.partition(" ")
        return _invoke_skill(name, rest.strip(), explicit=True)

    direct = _COMMAND_RE.match(raw)
    if not direct:
        return None
    name = direct.group(2)
    rest = (direct.group(3) or "").strip()
    return _invoke_skill(name, rest, explicit=False)


def explicit_skill_block(name: str) -> str:
    skill = skills_loader.get_skill(name)
    if not skill:
        return ""
    desc = skill.get("description") or ""
    text = skill.get("full_text") or ""
    return (
        f"===== Explicit Skill Invocation: {name} =====\n"
        f"Description: {desc}\n"
        "The user explicitly invoked this skill for the current turn. Apply it only to this turn.\n\n"
        f"{text}\n"
        f"===== End Explicit Skill: {name} ====="
    )


def _invoke_skill(name: str, rest: str, explicit: bool) -> SkillCommand | None:
    normalized = (name or "").strip()
    if not normalized:
        return None
    if normalized.lower() in {"skills", "skill-list"}:
        return SkillCommand(kind="list", message=_format_skill_list())
    skill = skills_loader.get_skill(normalized)
    if not skill:
        return SkillCommand(kind="error", message=f"Skill `{normalized}` is not installed. Use `/skill list` to see available skills, or `/skill install <GitHub URL>` to add one.") if explicit else None
    return SkillCommand(kind="invoke", skill_name=normalized, user_text=rest)


def _format_skill_list() -> str:
    skills = sorted(skills_loader.list_all(), key=lambda item: item.get("name", ""))
    if not skills:
        return "No skills are loaded."
    lines = ["Loaded skills:"]
    for item in skills:
        name = item.get("name", "")
        group = item.get("group", "")
        desc = (item.get("description") or "").strip()
        suffix = f" - {desc}" if desc else ""
        lines.append(f"- `{name}` ({group}){suffix}")
    lines.append("\nInvoke one with `/<name> your request` or `$<name> your request`.")
    return "\n".join(lines)


def install_github_skill(url: str, alias: str = "") -> str:
    """Install a skill directory from a public GitHub repository zipball.

    Supports:
    - https://github.com/owner/repo
    - https://github.com/owner/repo/tree/branch/path/to/skill
    - https://github.com/owner/repo/path/to/skill (best-effort path)
    """
    owner, repo, branch, subpath = _parse_github_url(url)
    candidates = [branch] if branch else ["main", "master"]
    last_error: Exception | None = None
    for candidate_branch in candidates:
        archive_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{candidate_branch}.zip"
        try:
            return _install_from_zip_url(archive_url, subpath, alias)
        except Exception as exc:
            last_error = exc
            continue
    raise RuntimeError(str(last_error) if last_error else "could not download GitHub skill")


def _parse_github_url(url: str) -> tuple[str, str, str, str]:
    parsed = urlparse(url)
    if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
        raise ValueError("only github.com skill URLs are supported")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) < 2:
        raise ValueError("GitHub URL must include owner and repository")
    owner, repo = parts[0], parts[1].removesuffix(".git")
    branch = ""
    subpath = ""
    if len(parts) >= 5 and parts[2] == "tree":
        branch = parts[3]
        subpath = "/".join(parts[4:])
    elif len(parts) > 2:
        subpath = "/".join(parts[2:])
    return owner, repo, branch, subpath


def _install_from_zip_url(url: str, subpath: str, alias: str) -> str:
    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read()
    with tempfile.TemporaryDirectory(prefix="sw_skill_") as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            zf.extractall(tmp_path)
        roots = [p for p in tmp_path.iterdir() if p.is_dir()]
        if not roots:
            raise RuntimeError("downloaded archive was empty")
        archive_root = roots[0]

        skill_dir = _find_skill_dir(archive_root, subpath)
        if not skill_dir:
            raise RuntimeError("SKILL.md not found in the GitHub archive/path")

        skill_name = _safe_skill_name(alias or skill_dir.name)
        target = SKILLS_NATURE_DIR / skill_name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(skill_dir, target, dirs_exist_ok=True)
        return skill_name


def _find_skill_dir(root: Path, subpath: str) -> Path | None:
    if subpath:
        candidate = (root / subpath).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            raise RuntimeError("invalid skill subpath")
        if (candidate / "SKILL.md").exists():
            return candidate
    if (root / "SKILL.md").exists():
        return root
    matches = sorted(root.rglob("SKILL.md"), key=lambda path: len(path.parts))
    return matches[0].parent if matches else None


def _safe_skill_name(value: str) -> str:
    name = re.sub(r"[^A-Za-z0-9_.-]+", "-", (value or "").strip()).strip("-._")
    if not name:
        raise ValueError("invalid skill name")
    return name[:80]
