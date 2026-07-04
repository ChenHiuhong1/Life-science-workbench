# PyInstaller entrypoint for the FastAPI backend sidecar.
#
# Example:
#   cd backend
#   ../.venv/Scripts/python.exe -m PyInstaller --onefile \
#       --name science-backend \
#       --add-data "knowledge;knowledge" \
#       run_server.py
#
# Output:
#   backend/dist/science-backend.exe

from pathlib import Path
import sys

import uvicorn


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from backend.config import settings
    from backend.main import app
except Exception:
    from config import settings  # type: ignore
    from main import app  # type: ignore


def main():
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level="info",
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()
