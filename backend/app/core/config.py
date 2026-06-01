from pathlib import Path
import os

BACKEND_ROOT = Path(__file__).resolve().parents[2]
STORAGE_ROOT = Path(os.getenv("AD_META_STORAGE_ROOT", BACKEND_ROOT / "storage"))
RAW_ROOT = STORAGE_ROOT / "raw"
CACHE_ROOT = STORAGE_ROOT / "cache"
DB_PATH = Path(os.getenv("AD_META_DB_PATH", STORAGE_ROOT / "ad_meta.sqlite3"))

COMPUTE_VERSION = "2026-06-01-v1"

PUBLIC_CHART_TYPES = {
    "species",
    "phylum",
    "boxplot",
    "heatmap",
    "sunburst",
    "pca",
    "pcoa",
}

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
