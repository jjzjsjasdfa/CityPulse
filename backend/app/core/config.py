from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "城迹 CityPulse API"
    app_version: str = "0.1.0"
    app_description: str = "可信、结构化、可定位的城市动态事件 API。"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://citypulse:citypulse-dev@localhost:5432/citypulse"
    backend_cors_origins: str = "http://localhost:8081,http://localhost:19006,http://localhost:18081,http://127.0.0.1:18081"
    ingestion_user_agent: str = "CityPulse/0.1"
    hunan_museum_base_url: str = "https://www.hnmuseum.com"
    ingestion_on_startup: bool = True
    amap_api_key: SecretStr | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
