from app.config import Settings


def test_plain_postgresql_url_uses_installed_psycopg_driver():
    settings = Settings(database_url="postgresql://geartrack:password@database:5432/geartrack")

    assert settings.sqlalchemy_database_url == "postgresql+psycopg://geartrack:password@database:5432/geartrack"


def test_explicit_postgresql_driver_is_preserved():
    settings = Settings(database_url="postgresql+psycopg://geartrack:password@database:5432/geartrack")

    assert settings.sqlalchemy_database_url == "postgresql+psycopg://geartrack:password@database:5432/geartrack"
