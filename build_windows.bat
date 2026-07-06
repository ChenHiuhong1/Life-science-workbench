@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo   Science Workbench - Windows Build
echo ========================================
echo.

if "%PYTHON_CMD%"=="" set "PYTHON_CMD=python"
if "%VENV_DIR%"=="" set "VENV_DIR=.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

"%PYTHON_CMD%" --version >nul 2>nul
if errorlevel 1 (
  if exist "%VENV_PY%" (
    "%VENV_PY%" --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=%VENV_PY%"
  )
)

"%PYTHON_CMD%" --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found in PATH and no runnable .venv exists.
  echo Install Python 3.12, set PYTHON_CMD to python.exe, or recreate .venv.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node/npm was not found in PATH.
  echo Install Node.js 20.19 or newer, or Node.js 22.12 or newer, then run this script again from cmd.exe.
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust/Cargo was not found in PATH.
  echo Install Rust stable, then run this script again from cmd.exe.
  exit /b 1
)

if exist "%VENV_PY%" (
  "%VENV_PY%" -c "import sys" >nul 2>nul
  if errorlevel 1 (
    echo [1/7] Existing Python virtual environment is broken; recreating %VENV_DIR%...
    rmdir /s /q "%VENV_DIR%"
    if exist "%VENV_PY%" (
      echo [WARN] Could not fully remove %VENV_DIR%; using .venv-build instead.
      set "VENV_DIR=.venv-build"
      set "VENV_PY=.venv-build\Scripts\python.exe"
    )
  )
)

if not exist "%VENV_PY%" (
  echo [1/7] Creating Python virtual environment in %VENV_DIR%...
  "%PYTHON_CMD%" -m venv "%VENV_DIR%"
  if errorlevel 1 exit /b 1
  "%VENV_PY%" -c "import sys" >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Created virtual environment is not runnable.
    exit /b 1
  )
)

echo [2/7] Installing backend dependencies and PyInstaller...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
"%VENV_PY%" -m pip install -r backend\requirements.txt pydantic-settings loguru pyinstaller
if errorlevel 1 exit /b 1

echo [3/7] Packaging FastAPI backend sidecar...
pushd backend
"..\%VENV_PY%" -m PyInstaller --onefile --clean --name science-backend --paths ".." --add-data "knowledge;knowledge" --add-data "bundled_skills;bundled_skills" run_server.py
if errorlevel 1 exit /b 1
popd

echo [4/7] Preparing Tauri sidecar binary...
if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
copy /Y "backend\dist\science-backend.exe" "src-tauri\binaries\science-backend-x86_64-pc-windows-msvc.exe" >nul
if errorlevel 1 exit /b 1

echo [5/7] Building frontend...
pushd frontend
if not exist "node_modules" (
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
popd

echo [6/7] Generating installer brand bitmaps...
"%VENV_PY%" "src-tauri\icons\gen_brand_bitmaps.py"
if errorlevel 1 exit /b 1

echo [7/7] Building Tauri Windows installers...
pushd src-tauri
call npx --yes @tauri-apps/cli@^2 build
if errorlevel 1 exit /b 1
popd

echo.
echo Build complete. Installer output:
echo   src-tauri\target\release\bundle\
echo.
endlocal
