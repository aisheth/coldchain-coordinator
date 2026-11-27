from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .config import settings
from .errors import AppError, app_error_handler
from .routers import assignments, auth, catalogue, misc, parties, requests, users


def create_app(init_db: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if init_db:  # prototype convenience; replace with Alembic migrations
            from .db import SessionLocal, engine
            from .models import Base
            from .seed import seed_uoms
            Base.metadata.create_all(engine)
            with SessionLocal() as db:
                seed_uoms(db)
                db.commit()
        yield

    app = FastAPI(title="Procurement Management API", version="0.1.0", lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"],
                       allow_credentials=origins != ["*"])
    app.add_exception_handler(AppError, app_error_handler)
    for module in (auth, users, catalogue, parties, requests, assignments, misc):
        app.include_router(module.router, prefix="/api/v1")

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse(url="/docs")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
