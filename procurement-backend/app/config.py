from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://procure:procure@localhost:5432/procure"
    secret_key: str = Field(min_length=32)
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    upload_dir: str = "uploads"
    max_upload_mb: int = 10
    cors_origins: str = "*"  # comma separated; tighten for production


settings = Settings()
