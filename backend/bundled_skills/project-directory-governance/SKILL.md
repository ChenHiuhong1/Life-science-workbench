---
description: Directory governance rules for project-local agent folders and .codex-like structures.
---

# Project Directory Governance

The workbench may create project-local agent folders, but the structure must be predictable and easy to clean.

## Hard Constraints

- Always separate configuration, knowledge, modules, artifacts, cache, logs, and temporary files.
- Always keep draft module specs separate from approved module specs.
- Must not create scattered top-level folders for one-off intermediate files.
- Must not store unique user outputs in cache or tmp folders.
- Do not mirror a private .codex directory blindly; create a project-specific structure with clear ownership.

## Recommended Project Structure

```text
.science-agent/
  config/
    agents/
    skills/
    harness/
  knowledge/
    bioinformatics/
    structural-biology/
    protocols/
    literature/
    research-design/
  modules/
    draft/
    approved/
    archived/
  artifacts/
    sessions/
    notebooks/
    graphs/
    previews/
  manifests/
    artifact_manifest.json
    skill_manifest.json
    module_manifest.json
  logs/
    agent/
    tool/
    build/
  cache/
  tmp/
```

## File Placement Rules

- Put stable reusable instructions in `knowledge/` or `config/skills/`.
- Put unconfirmed workflows in `modules/draft/`.
- Put user-confirmed module specs in `modules/approved/`.
- Put generated user-visible outputs in `artifacts/`.
- Put disposable downloads, indexes, and derived caches in `cache/`.
- Put short-lived scratch files in `tmp/`.
