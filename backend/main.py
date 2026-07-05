"""FastAPI entrypoint for the Science Workbench backend."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from . import logging_config  # noqa: F401
from .config import settings as app_settings
from .core.agent_registry import registry
from .core.skills_loader import load_all_skills
from .db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("initializing database...")
    init_db()

    logger.info("loading runtime skill constraints...")
    load_all_skills()

    logger.info("registering agents...")
    registry.register_all()

    logger.info("Science Workbench backend is ready")
    yield
    logger.info("shutting down...")


app = FastAPI(
    title="Science Workbench API",
    version="0.1.3",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": app_settings.llm_model}


from .routers import (  # noqa: E402
    artifacts,
    chat,
    filesystem,
    hpc,
    literature,
    projects,
    sessions,
    settings as settings_router,
)

for router_module in (projects, sessions, chat, literature, artifacts, settings_router, filesystem, hpc):
    app.include_router(router_module.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=app_settings.host,
        port=app_settings.port,
        reload=True,
    )
