import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_cors_origins_can_be_configured_from_environment(monkeypatch) -> None:
    monkeypatch.setenv(
        "AD_META_CORS_ORIGINS",
        "https://research.example, https://review.example",
    )

    settings = Settings(_env_file=None)

    assert settings.cors_origins == (
        "https://research.example, https://review.example"
    )


def test_projection_cache_entry_limit_cannot_exceed_total_limit() -> None:
    with pytest.raises(ValidationError, match="must not exceed"):
        Settings(
            _env_file=None,
            projection_file_cache_max_entry_bytes=2048,
            projection_file_cache_max_total_bytes=1024,
        )


def test_mag_storage_backend_is_validated() -> None:
    assert Settings(_env_file=None, mag_storage_backend="DATABASE").mag_storage_backend == "database"
    with pytest.raises(ValidationError, match="MAG_STORAGE_BACKEND"):
        Settings(_env_file=None, mag_storage_backend="object-store")
