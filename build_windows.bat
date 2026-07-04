@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo   Science Workbench - Windows Build
echo ========================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found in PATH.
  echo Install Python 3.12, then run this script again from cmd.exe.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node/npm was not found in PATH.
  echo Install Node.js 20 or newer, then run this script again from cmd.exe.
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust/Cargo was not found in PATH.
  echo Install Rust stable, then run this script again from cmd.exe.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/6] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 exit /b 1
)

echo [2/6] Installing backend dependencies and PyInstaller...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt pydantic-settings loguru pyinstaller
if errorlevel 1 exit /b 1

echo [3/6] Packaging FastAPI backend sidecar...
pushd backend
"..\.venv\Scripts\python.exe" -m PyInstaller --onefile --clean --name science-backend --paths ".." --add-data "knowledge;knowledge" --add-data "bundled_skills;bundled_skills" run_server.py
if errorlevel 1 exit /b 1
popd

echo [4/6] Preparing Tauri sidecar binary...
if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
copy /Y "backend\dist\science-backend.exe" "src-tauri\binaries\science-backend-x86_64-pc-windows-msvc.exe" >nul
if errorlevel 1 exit /b 1

echo [5/6] Building frontend...
pushd frontend
if not exist "node_modules" (
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
popd

echo [6/6] Building Tauri Windows installers...
call npx --yes @tauri-apps/cli@^2 build
if errorlevel 1 exit /b 1

echo.
echo Build complete. Installer output:
echo   src-tauri\target\release\bundle\
echo.
endlocal
