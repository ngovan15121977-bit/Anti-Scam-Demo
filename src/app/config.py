"""Cấu hình tập trung, đọc từ biến môi trường / file .env."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Resolve from this checkout, not from whichever directory starts Uvicorn.
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "FIN-19 Anti-Scam Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Danh sách origin cho CORS, phân tách bằng dấu phẩy.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ---- Database ----
    database_url: str = "postgresql+psycopg2://antiscam:antiscam@localhost:5432/antiscam"
    database_schema: str = Field(default="public", pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")

    # Schema được quản lý bằng Alembic / file SQL, không tự tạo khi app khởi động.
    db_auto_create: bool = False

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    # ---- Auth ----
    # Bắt buộc override ở production, xem validate_production_secrets().
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=1)
    remember_me_expire_days: int = Field(default=30, ge=1, le=90)
    history_cursor_secret: str = ""

    # ---- Cloudinary media storage ----
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ---- LLM ----
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    # Timi's in-app assistant uses Groq through its OpenAI-compatible endpoint.
    # Keep it separate so the optional transaction-explanation integration can
    # continue using its own provider configuration.
    groq_api_key: str = ""
    groq_model_name: str = "openai/gpt-oss-20b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Agent-owned Scam Guardian decisions. The backend validates the bounded
    # JSON contract and executes only the returned safety action.
    guardian_agent_enabled: bool = True
    guardian_agent_model: str = "llama-3.1-8b-instant"
    # Avoid spending a provider request on every short STT fragment.
    guardian_agent_min_interval_seconds: float = Field(default=6.0, ge=0.0, le=60.0)
    # Realtime Guardian fallback STT. Uses Groq Whisper when configured.
    guardian_stt_enabled: bool = True
    # Prefer the accuracy-oriented Whisper model for short Vietnamese call
    # segments; override with whisper-large-v3-turbo when latency/cost wins.
    guardian_stt_model: str = "whisper-large-v3"
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_explanation_enabled: bool = False

    # ---- Vector store (pgvector, dùng chung DB với Postgres) ----
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = Field(default=1536, ge=1)

    # ---- Recipient lookup ----
    # Token proves that a recipient name came from the internal directory.
    recipient_lookup_token_expire_seconds: int = Field(default=300, ge=30, le=900)

    # Separate HMAC secret for pseudonymizing transaction device/network data.
    # It must be configured separately from JWT_SECRET_KEY in production.
    risk_telemetry_hash_key: str = ""

    # ---- Local lightweight OpenCV face verification ----
    face_model_preload: bool = False
    # Production images ship verified models; do not fetch executable model
    # files from the network during a user request unless explicitly enabled.
    face_model_allow_download: bool = True
    face_model_dir: str = str(PROJECT_ROOT / "models" / "face")
    # Changes whenever preprocessing/model changes, so old embeddings are re-enrolled.
    face_model_id: str = "opencv-sface-yunet"
    face_embedding_version: str = "opencv-sface-face-crop-v1"
    face_similarity_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    face_login_similarity_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
    face_transaction_similarity_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    face_transaction_failure_limit: int = Field(default=5, ge=1)
    face_transaction_lock_seconds: int = Field(default=30, ge=1)

    @computed_field
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_production_secrets(self) -> None:
        """Chặn khởi động production với secret mặc định."""
        if self.app_env == "production" and self.jwt_secret_key.startswith("dev-only"):
            raise RuntimeError(
                "JWT_SECRET_KEY vẫn là giá trị mặc định. "
                "Đặt một secret ngẫu nhiên trước khi chạy production."
            )
        if self.app_env == "production" and not self.risk_telemetry_hash_key:
            raise RuntimeError(
                "RISK_TELEMETRY_HASH_KEY chưa được cấu hình. "
                "Đặt một secret ngẫu nhiên riêng cho dữ liệu telemetry."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
