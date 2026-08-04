"""Cấu hình tập trung, đọc từ biến môi trường / file .env."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
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

    # Tạo bảng tự động khi startup. Dùng cho dev; production nên dùng Alembic.
    db_auto_create: bool = True

    # ---- Auth ----
    # Bắt buộc override ở production, xem validate_production_secrets().
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=1)

    # ---- LLM ----
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)

    # ---- Vector store (pgvector, dùng chung DB với Postgres) ----
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = Field(default=1536, ge=1)

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
