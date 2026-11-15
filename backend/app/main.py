from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import errors as pg
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db import get_sessionmaker
from app.routers import (
    admin,
    ai_providers,
    apple_health,
    assistant,
    auth,
    bank_sms,
    call,
    calls,
    chatgpt,
    dashboard,
    documents,
    domains,
    exercises,
    export,
    food,
    gmail,
    integrations,
    legal,
    medications,
    plan,
    profile,
    saver,
    subscriptions,
    tasks,
    training,
    whoop,
)
from app.services import saver_jobs
from app.services.whoop_sync import scheduler


def _integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    # Constraints in the database are the last line of defence; turn them into answers the app can show.
    cause = exc.orig
    if isinstance(cause, pg.UniqueViolation):
        return JSONResponse({"detail": "That already exists."}, status.HTTP_409_CONFLICT)
    if isinstance(cause, pg.ForeignKeyViolation):
        return JSONResponse({"detail": "That refers to something that doesn't exist."}, status.HTTP_422_UNPROCESSABLE_CONTENT)
    return JSONResponse({"detail": "That value isn't allowed."}, status.HTTP_422_UNPROCESSABLE_CONTENT)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Background WHOOP sync; does nothing unless WHOOP is configured.
    scheduler.start()
    # Saver items left half-done by a restart get a Try again button instead of waiting forever.
    saver_jobs.recover()
    yield
    scheduler.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Orbit API", version="0.1.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["Authorization", "Content-Type"]
        )
    app.add_exception_handler(IntegrityError, _integrity_error)

    @app.get("/health", tags=["health"])
    def health():
        """For Coolify's health check: the API is up and can reach Postgres."""
        with get_sessionmaker()() as db:
            db.execute(text("select 1"))
        return {"ok": True}

    for router in (
        auth.router,
        profile.router,
        tasks.router,
        tasks.reminders_router,
        tasks.lists_router,
        tasks.steps_router,
        dashboard.router,
        export.router,
        whoop.router,
        gmail.router,
        subscriptions.router,
        apple_health.router,
        food.foods,
        food.router,
        assistant.router,
        integrations.router,
        ai_providers.router,
        call.router,
        chatgpt.router,
        admin.router,
        bank_sms.router,
        legal.router,
        saver.router,
        calls.router,
        *domains.ROUTERS,
        *exercises.ROUTERS,
        *training.ROUTERS,
        *plan.ROUTERS,
        *medications.ROUTERS,
        documents.router,
    ):
        app.include_router(router)
    return app


app = create_app()
