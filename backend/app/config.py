from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://geartrack:geartrack@localhost:5432/geartrack"
    cors_origins: str = "http://localhost:5173"
    wear_trail_factor: float = Field(default=1.25, ge=1.0)
    wear_elevation_factor_per_100m: float = Field(default=0.03, ge=0.0)

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
