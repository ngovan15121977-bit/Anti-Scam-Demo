from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, health, recipients, transactions
from app.config import get_settings

settings = get_settings()
settings.validate_production_secrets()

app = FastAPI(title="FintechGuard API", version="2.0.0")
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


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "FintechGuard API is running", "docs": "/docs"}
