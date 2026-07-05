# Release checklist

## Before tagging

1. Run the browser preview only for UI checks:

   ```bat
   start_web.bat
   ```

2. Run the desktop development shell:

   ```bat
   start.bat
   ```

3. Verify the core flows:

   - Create a project.
   - Create at least three conversations quickly.
   - Send a streaming message and stop it.
   - Run code that creates a PNG artifact.
   - Preview the PNG in the artifact panel.
   - Open the artifact folder.
   - Save settings, including model thinking effort.

4. Run local checks:

   ```bat
   cd /d D:\science_application\frontend
   npm.cmd run build
   ```

   ```bat
   cd /d D:\science_application
   python -m py_compile backend\main.py backend\config.py backend\core\llm.py
   ```

## Publish to GitHub Releases

1. Push the repository to GitHub.
2. Create and push a version tag (replace `vX.Y.Z` with the actual version):

   ```bat
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. GitHub Actions will build the Windows installers and attach them to the Release.
4. Download the `.exe` or `.msi` from the Release page and test it on a clean Windows machine.

The final user-facing install path is the GitHub Release installer, not `start.bat` or the browser preview. Local packaging uses the npm Tauri CLI package through `npx`; do not run `cargo install tauri-cli` unless you specifically want the Rust CLI installed globally.
