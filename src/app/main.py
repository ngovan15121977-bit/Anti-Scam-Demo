import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.app.api import admin, assistant, auth, health, recipients, transactions, url_safety
from src.app.config import get_settings
from src.app.services.face_verification import warm_face_model

settings = get_settings()
settings.validate_production_secrets()

app = FastAPI(title="FintechGuard API", version="2.0.0")
media_directory = settings.project_root / "data" / "uploads"
media_directory.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_directory), name="media")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(recipients.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(url_safety.router, prefix="/api/v1")
app.include_router(assistant.router, prefix="/api/v1")


@app.on_event("startup")
def preload_face_ai() -> None:
    """Warm the cached Hugging Face model before the API starts serving users."""
    try:
        warm_face_model()
    except Exception:
        logging.getLogger(__name__).warning("Face AI warm-up failed; it will retry on first verification.")


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "FintechGuard API is running", "docs": "/docs"}
