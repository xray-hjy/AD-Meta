"""Storage manifest paths without importing the dataset computation pipeline."""
from pathlib import Path

DEFAULT_MANIFEST = Path(__file__).resolve().parents[2] / "storage_manifest.json"
