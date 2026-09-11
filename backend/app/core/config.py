from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "城迹 CityPulse API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = (
        "postgresql+psycopg://citypulse:citypulse-dev@localhost:5432/citypulse"
    )
    backend_cors_origins: str = "http://localhost:8081,http://localhost:19006"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

