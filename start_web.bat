@echo off
setlocal

cd /d "%~dp0"

title Science Workbench Web Preview
echo ========================================
echo   Science Workbench - Web Preview
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
  echo Install Node.js 20 or newer, then run this script again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo [2/4] Installing backend dependencies...
".venv\Scripts\python.exe" -m pip install -q -r backend\requirements.txt pydantic-settings loguru
if errorlevel 1 (
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo [3/4] Starting backend on http://127.0.0.1:8000 ...
  start "Science Workbench Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --log-level warning"
  timeout /t 4 /nobreak >nul
) else (
  echo [3/4] Backend is already running on http://127.0.0.1:8000.
)

echo [4/4] Starting web preview on http://127.0.0.1:5173 ...
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
start "Science Workbench Frontend" cmd /k "npx vite --host 127.0.0.1 --port 5173"
popd

timeout /t 3 /nobreak >nul
echo.
echo ========================================
echo   Web preview ready.
echo   Browser: http://127.0.0.1:5173
echo   This is only for pre-release testing.
echo ========================================
echo.
start http://127.0.0.1:5173
pause
