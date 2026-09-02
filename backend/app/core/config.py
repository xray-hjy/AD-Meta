import re
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT.parent / ".env")

class Settings(BaseSettings):
    """Validated runtime settings with explicit production safety checks."""

    model_config = SettingsConfigDict(
        env_prefix="AD_META_",
        env_file=BACKEND_ROOT.parent / ".env",
        extra="ignore",
    )

    environment: str = "development"
    storage_root: Path = BACKEND_ROOT / "storage"
    mag_data_root: Path = Path("ADMetaData")
    mag_data_version: str = "mag_v2"
    db_path: Path | None = None
    db_engine: str = "mysql"
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "ad_meta"
    mysql_connect_timeout: int = 10
    mysql_read_timeout: int = 30
    mysql_pool_recycle: int = 1800
    stats_worker_url: str = ""
    stats_worker_timeout: int = 300
    projection_cache_ttl_hours: int = Field(default=168, ge=1)
    projection_cache_cleanup_interval_seconds: int = Field(default=3600, ge=60)
    projection_cache_cleanup_batch_size: int = Field(default=500, ge=1, le=5000)

    @model_validator(mode="after")
    def validate_runtime(self):
        self.db_engine = self.db_engine.strip().lower()
        self.mag_data_version = self.mag_data_version.strip()
        if not re.fullmatch(r"mag_v[1-9]\d*", self.mag_data_version):
            raise ValueError("AD_META_MAG_DATA_VERSION must use the form 'mag_vN'.")
        if self.db_engine not in {"mysql", "sqlite"}:
            raise ValueError("AD_META_DB_ENGINE must be either 'mysql' or 'sqlite'.")
        if self.environment.strip().lower() == "production" and self.db_engine == "mysql":
            if self.mysql_user.strip().lower() == "root":
                raise ValueError("Production MySQL must not use the root account.")
            if not self.mysql_password:
                raise ValueError("Production MySQL requires a non-empty password.")
        return self


SETTINGS = Settings()

STORAGE_ROOT = SETTINGS.storage_root
RAW_ROOT = STORAGE_ROOT / "raw"
CACHE_ROOT = STORAGE_ROOT / "cache"
STAGING_ROOT = STORAGE_ROOT / "staging"
DB_PATH = SETTINGS.db_path or (STORAGE_ROOT / "ad_meta.sqlite3")
DB_ENGINE = SETTINGS.db_engine

MYSQL_HOST = SETTINGS.mysql_host
MYSQL_PORT = SETTINGS.mysql_port
MYSQL_USER = SETTINGS.mysql_user
MYSQL_PASSWORD = SETTINGS.mysql_password
MYSQL_DATABASE = SETTINGS.mysql_database
MYSQL_CONNECT_TIMEOUT = SETTINGS.mysql_connect_timeout
MYSQL_READ_TIMEOUT = SETTINGS.mysql_read_timeout
MYSQL_POOL_RECYCLE = SETTINGS.mysql_pool_recycle
STATS_WORKER_URL = SETTINGS.stats_worker_url.rstrip("/")
STATS_WORKER_TIMEOUT = SETTINGS.stats_worker_timeout
PROJECTION_CACHE_TTL_HOURS = SETTINGS.projection_cache_ttl_hours
PROJECTION_CACHE_CLEANUP_INTERVAL_SECONDS = (
    SETTINGS.projection_cache_cleanup_interval_seconds
)
PROJECTION_CACHE_CLEANUP_BATCH_SIZE = SETTINGS.projection_cache_cleanup_batch_size

COMPUTE_VERSION = "2026-08-13-ordination-v3"

PUBLIC_CHART_TYPES = {
    "species",
    "phylum",
    "boxplot",
    "heatmap",
    "detection",
    "differential_ko",
    "differential_abundance",
    "lda",
    "taxonomy",
    "taxonomy_sankey",
    "pca",
    "pcoa",
}

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
