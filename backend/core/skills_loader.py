"""Runtime loader for skill and knowledge constraints."""
import re
from pathlib import Path
from typing import Dict, List

from loguru import logger

from ..config import BUNDLED_SKILLS_DIR, KNOWLEDGE_DIR, SKILLS_NATURE_DIR, SKILLS_SUPERPOWERS_DIR


_CONSTRAINT_PATTERNS = [
    re.compile(r"^\s*(?:-\s*)?(never|do not|don't|must|always|mandatory|required|forbidden)\b.*", re.I),
    re.compile(r"^\s*#+\s*(constraint|rule|red line|forbidden|mandatory|required).*$", re.I),
]

_DESC_RE = re.compile(r'^description:\s*"?(.+?)"?\s*$', re.I | re.M)
_MAX_CONSTRAINT_CHARS = 6000


def _extract_frontmatter_description(text: str) -> str:
    match = _DESC_RE.search(text[:800])
    return match.group(1).strip() if match else ""


def _extract_constraints(text: str) -> List[str]:
    lines = text.splitlines()
    hits = []
    for line in lines:
        for pattern in _CONSTRAINT_PATTERNS:
            if pattern.match(line):
                hits.append(line.strip(" -\t"))
                break
    return hits


def parse_skill_file(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        logger.warning(f"failed to read skill {path}: {exc}")
        return {}

    desc = _extract_frontmatter_description(text)
    constraints = _extract_constraints(text)

    if not desc:
        for line in text.splitlines():
            value = line.strip().lstrip("#").strip()
            if value:
                desc = value[:200]
                break

    return {
        "name": path.parent.name,
        "path": str(path),
        "description": desc,
        "constraints": constraints,
        "full_text": text[:_MAX_CONSTRAINT_CHARS],
    }


_loaded: Dict[str, dict] = {}
_loaded_groups: Dict[str, List[str]] = {}


def _store_skill(parsed: dict, group: str, override: bool = True) -> None:
    name = parsed.get("name")
    if not name:
        return
    if name in _loaded and not override:
        logger.info(f"[skills] keeping bundled skill over optional external duplicate: {name}")
    else:
        parsed["group"] = group
        _loaded[name] = parsed
    if name not in _loaded_groups.setdefault(group, []):
        _loaded_groups[group].append(name)


def _scan_dir(base: Path, group: str, override: bool = True):
    if not base.exists():
        logger.info(f"[skills] directory does not exist, skipping: {base}")
        return
    for md in base.glob("*/SKILL.md"):
        parsed = parse_skill_file(md)
        if parsed:
            _store_skill(parsed, group, override=override)


def _scan_knowledge():
    if not KNOWLEDGE_DIR.exists():
        return
    for md in KNOWLEDGE_DIR.rglob("*.md"):
        rel = md.relative_to(KNOWLEDGE_DIR)
        group = rel.parts[0] if len(rel.parts) > 1 else "knowledge"
        parsed = parse_skill_file(md)
        if parsed:
            parsed["name"] = md.stem
            _store_skill(parsed, group, override=True)


def load_all_skills():
    _loaded.clear()
    _loaded_groups.clear()

    _scan_dir(BUNDLED_SKILLS_DIR, "bundled", override=True)
    _scan_dir(SKILLS_NATURE_DIR, "nature", override=False)
    if SKILLS_SUPERPOWERS_DIR.exists():
        for md in SKILLS_SUPERPOWERS_DIR.glob("*/SKILL.md"):
            parsed = parse_skill_file(md)
            if parsed:
                _store_skill(parsed, "superpowers", override=False)
    _scan_knowledge()

    total = sum(len(items) for items in _loaded_groups.values())
    groups = ", ".join(f"{group}({len(items)})" for group, items in _loaded_groups.items())
    logger.info(f"[skills] loaded {total} constraint sources: {groups}")


def get_skill(name: str) -> dict | None:
    return _loaded.get(name)


def get_group(group: str) -> List[dict]:
    return [_loaded[name] for name in _loaded_groups.get(group, []) if name in _loaded]


def build_constraint_block(names: List[str], max_chars: int = 12000) -> str:
    parts = []
    used = 0
    per_skill_budget = max(800, max_chars // max(1, len(names)))
    for name in names:
        skill = _loaded.get(name)
        if not skill:
            continue
        desc = skill["description"]
        constraints = skill["constraints"][:40]

        if len(constraints) >= 3:
            constraints_txt = "\n".join(f"  - {item}" for item in constraints)
            block = f"### {name}\nDescription: {desc}\nHard constraints:\n{constraints_txt}\n"
        else:
            full_text = skill["full_text"][:per_skill_budget]
            block = f"### {name}\n{full_text}\n"

        if used + len(block) > max_chars:
            block = f"### {name}\nDescription: {desc}\n(See {skill['path']})\n"
            if used + len(block) > max_chars:
                break
        parts.append(block)
        used += len(block)
    return "\n".join(parts)


def list_all() -> List[dict]:
    return list(_loaded.values())
