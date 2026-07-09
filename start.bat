@echo off
setlocal

cd /d "%~dp0"

title Science Workbench Desktop
echo ========================================
echo   Science Workbench - Desktop App
echo ========================================
echo.

if "%APPDATA%"=="" (
  set "SCIENCE_WORKBENCH_HOME=%USERPROFILE%\AppData\Roaming\ScienceWorkbench"
) else (
  set "SCIENCE_WORKBENCH_HOME=%APPDATA%\ScienceWorkbench"
)
if not exist "%SCIENCE_WORKBENCH_HOME%" mkdir "%SCIENCE_WORKBENCH_HOME%"
echo App data: %SCIENCE_WORKBENCH_HOME%
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found in PATH.
  echo Install Python 3.12, then run this script again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node/npm was not found in PATH.
  echo Install Node.js 20.19 or newer, or Node.js 22.12 or newer, then run this script again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust/Cargo was not found in PATH.
  echo Install Rust stable to open the desktop development app.
  pause
  exit /b 1
)

set "VENV_DIR=.venv"
if exist "%VENV_DIR%\Scripts\python.exe" if not exist "%VENV_DIR%\pyvenv.cfg" (
  echo [WARN] %VENV_DIR% exists but is incomplete ^(missing pyvenv.cfg^).
  echo        Leaving it untouched and using .venv-dev for this run.
  set "VENV_DIR=.venv-dev"
)
if exist "%VENV_DIR%\Scripts\python.exe" (
  "%VENV_DIR%\Scripts\python.exe" -c "import sys; print(sys.executable)" >nul 2>nul
  if errorlevel 1 (
    echo [WARN] %VENV_DIR% exists but Python cannot start.
    if /I "%VENV_DIR%"==".venv-dev" (
      echo        Leaving it untouched and using .venv-dev-fresh for this run.
      set "VENV_DIR=.venv-dev-fresh"
    ) else (
      echo        Leaving it untouched and using .venv-dev for this run.
      set "VENV_DIR=.venv-dev"
    )
  )
)

if not exist "%VENV_DIR%\Scripts\python.exe" (
  echo [1/5] Creating Python virtual environment...
  python -m venv "%VENV_DIR%"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo [2/5] Installing backend dependencies...
"%VENV_DIR%\Scripts\python.exe" -m pip install -q -r backend\requirements.txt pydantic-settings loguru
if errorlevel 1 (
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo [3/5] Starting backend on http://127.0.0.1:8000 ...
  start "Science Workbench Backend" cmd /k ""%VENV_DIR%\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --log-level warning"
  timeout /t 4 /nobreak >nul
) else (
  echo [3/5] Backend is already running on http://127.0.0.1:8000.
)

echo [4/5] Preparing frontend dev server...
pushd frontend
if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install
  if errorlevel 1 (
    popd
    pause
    exit /b 1
  )
)
popd

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Starting frontend dev server on http://127.0.0.1:5173 ...
  start "Science Workbench Frontend" cmd /k "cd /d %~dp0frontend && npx vite --host 127.0.0.1 --port 5173"
  timeout /t 4 /nobreak >nul
) else (
  echo Frontend dev server is already running on http://127.0.0.1:5173.
)

echo [5/5] Opening the desktop app window...
echo.
echo This is the Tauri desktop shell. It is not the browser preview.
echo Close the app window to return to this terminal.
echo.
pushd src-tauri
cargo run
set APP_EXIT=%ERRORLEVEL%
popd

if not "%APP_EXIT%"=="0" (
  echo.
  echo [ERROR] Desktop app exited with code %APP_EXIT%.
  echo If this is the first run, Rust may need network access to download crates.
)

pause
exit /b %APP_EXIT%
