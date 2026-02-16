"""FastAPI application with lifespan for DB pool, checkpointer, telemetry, and task runner."""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_pool, close_pool
from app.services.centrifugo_bridge import centrifugo_bridge
from app.services.task_runner import poll_agent_tasks
from app.services.checkpointer import init_checkpointer, close_checkpointer
from app.services.telemetry import init_telemetry
from graph.tools.registry import seed_builtin_tools
from app.routes.webhooks import router as webhooks_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("litellm").setLevel(logging.WARNING)

logger = logging.getLogger("roka")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting Roka backend")

    # 1. DB pool
    await init_pool()
    logger.info("DB pool initialized (min=%d, max=%d)", settings.db_pool_min, settings.db_pool_max)

    # 2. LangGraph checkpointer (persistent agent memory)
    try:
        await init_checkpointer()
    except Exception as e:
        logger.warning("Checkpointer init failed (will retry on first use): %s", e)

    # 3. OpenTelemetry
    init_telemetry()

    # 4. Seed built-in tool definitions
    try:
        await seed_builtin_tools()
    except Exception as e:
        logger.warning("Tool seeding failed: %s", e)

    # 5. Task poller
    task = asyncio.create_task(poll_agent_tasks())

    # 6. Centrifugo bridge (Postgres LISTEN -> publish)
    bridge_task = asyncio.create_task(centrifugo_bridge())

    yield

    bridge_task.cancel()
    try:
        await bridge_task
    except asyncio.CancelledError:
        pass
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await close_checkpointer()
    await close_pool()
    logger.info("Roka backend shut down")


app = FastAPI(
    title="Roka Backend",
    description="Agent service for the Roka workspace",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(webhooks_router, prefix="/api/webhooks", tags=["webhooks"])


@app.get("/health")
async def health():
    return {"status": "ok"}
