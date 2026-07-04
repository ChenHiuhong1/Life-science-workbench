# Science Workbench

Science Workbench is a local desktop AI workbench for research workflows. The target distribution is a Windows desktop app: users download an installer from GitHub Releases, install it, and open Science Workbench from the Start menu or desktop shortcut.

The browser URL `http://127.0.0.1:5173` is only for development and pre-release UI validation. It is not the final user entrypoint.

## User Installation

Open the repository's GitHub Releases page and download the Windows installer from the latest release assets:

- Recommended: `*.exe`, the NSIS installer.
- Alternative: `*.msi`, the Windows Installer package.

After installation, open `Science Workbench` from the Start menu or desktop shortcut.

End users do not need to install Python, Node.js, Rust, or run `start.bat`.

## Publishing Installers

After validation, maintainers publish a version tag:

```bat
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will:

1. Prepare Python 3.12, Node.js 20, and Rust on `windows-latest`.
2. Package the FastAPI backend as `science-backend.exe` with PyInstaller.
3. Add the backend as a Tauri sidecar.
4. Build `.exe` and `.msi` Windows installers.
5. Upload installers to the matching GitHub Release.

Workflow file:

```text
.github/workflows/build-desktop.yml
```

## Development Desktop App

Local development requires:

- Python 3.12
- Node.js 20+
- Rust stable / Cargo

Run:

```bat
cd /d D:\science_application
start.bat
```

This starts the local backend and frontend dev server, then opens the Tauri desktop window.

## Browser Preview

Browser preview is only for UI testing:

```bat
start_web.bat
```

## App Data Directory

Installed builds use their own local app folder:

```text
%APPDATA%\ScienceWorkbench
```

Stored data includes:

- `.env`: model, API key, and runtime settings.
- `data\app.db`: projects, sessions, messages, starred literature, and HPC connections.
- `data\artifacts\`: generated figures, tables, and other artifacts.
- `logs\app.log`: backend logs.
- `workspaces\`: default project workspaces.

Projects can also point to external research folders, such as data drives, project folders, or synced folders.

## Bundled Agent Skills

Open-source installs do not depend on private local skill folders. Core agent skills are shipped in:

```text
backend\bundled_skills\
```

These bundled skills cover harness behavior, self-awareness, agent isolation, project directory governance, algorithm/package-first sourcing, protein structure/design/docking/embedding workflows, Nature-style responses, critical review, study-design knowledge organization, conditional notebook/graph generation, and Module agent workflow packaging.

Optional user skills can still be loaded from:

```text
%USERPROFILE%\.agents\skills
```

or by setting:

```text
SCIENCE_WORKBENCH_USER_SKILLS_DIR
```

## Modules

- Chat: project sessions, streaming responses, stop generation, code execution, and artifact tracking.
- Literature: PubMed, arXiv, CrossRef, and Semantic Scholar aggregated search.
- Study Design: literature-grounded brainstorming, hypothesis generation, and proposal planning.
- Bio-Analysis: Python/R workflows, figure artifacts, and environment snapshots.
- Protocol: wet-lab protocol building, Q&A, and data processing.
- Reviewer: multi-domain review checklists and text revision.
- Module: workflow extraction, user-guided revision, and formal module packaging.
- HPC: SSH connections, remote commands, upload/download, and scheduler queues.

## Release Validation

See:

```text
RELEASE_CHECKLIST.md
```
