from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://geartrack:geartrack@localhost:5432/geartrack"
    cors_origins: str = "http://localhost:5173"
    wear_trail_factor: float = Field(default=1.25, ge=1.0)
    wear_elevation_factor_per_100m: float = Field(default=0.03, ge=0.0)
    coros_mcp_url: str = "https://mcp.coros.com/mcp"
    coros_redirect_uri: str = "http://localhost:8001/api/coros/oauth/callback"
    coros_enabled: bool = True

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        url = make_url(self.database_url)
        if url.drivername in {"postgres", "postgresql"}:
            url = url.set(drivername="postgresql+psycopg")
        return url.render_as_string(hide_password=False)


settings = Settings()
