# Windows desktop packaging

Science Workbench is intended to ship as a Windows desktop application. The browser URL is only a pre-release preview surface for UI testing.

The app owns a stable local data folder:

```text
%APPDATA%\ScienceWorkbench
```

This folder stores settings, SQLite data, logs, artifacts and the default `workspaces` directory. User projects can either use that default workspace folder or bind to any external research folder.

## Open During Development

Use the desktop shell:

```bat
cd /d D:\science_application
start.bat
```

`start.bat` starts the backend and frontend dev server in the background, then opens the Tauri desktop window with `cargo run`. It does not open the browser.

For browser-only preview testing, use:

```bat
start_web.bat
```

## Prerequisites For Desktop Development

Install these on the Windows machine and make sure they are available in `PATH`:

1. Python 3.12
2. Node.js 20 or newer
3. Rust stable / Cargo

The first desktop run may need network access while Cargo downloads Rust crates.

## Build Installers

For release packaging, run:

```bat
cd /d D:\science_application
build_windows.bat
```

When the build completes, Windows installers are written to:

```text
src-tauri\target\release\bundle\
```

The packaged app starts the FastAPI backend as a Tauri sidecar, so end users do not open `http://127.0.0.1:5173` manually.

The backend sidecar bundles both runtime knowledge and repository-shipped skills:

```text
backend\knowledge\
backend\bundled_skills\
```

Private local skills are optional. Release builds must not require a maintainer's `C:\Users\...\ .agents\skills` folder.

## GitHub Release Flow

After the repo is pushed to GitHub, publish installers by pushing a version tag:

```bat
git tag v0.1.0
git push origin v0.1.0
```

The workflow in `.github/workflows/build-desktop.yml` builds the Windows installers on `windows-latest`, uploads them as workflow artifacts, and attaches them to the GitHub Release for the tag. The workflow uses the npm Tauri CLI package, so it does not need to compile `tauri-cli` with `cargo install`.

Manual test builds can also be started from the GitHub Actions tab with `workflow_dispatch`; those builds upload artifacts but do not create a Release unless they run from a `v*` tag.
