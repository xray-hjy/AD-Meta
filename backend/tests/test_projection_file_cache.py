from __future__ import annotations

import os
import time
from pathlib import Path
from unittest.mock import patch

from app.services import projection_file_cache


def test_expired_and_oversized_entries_are_removed(tmp_path: Path) -> None:
    expired = tmp_path / "projections" / "charts" / "expired.json"
    expired.parent.mkdir(parents=True)
    expired.write_text('{"ok": true}', encoding="utf-8")
    old = time.time() - 7200
    os.utime(expired, (old, old))
    with patch.object(projection_file_cache, "PROJECTION_CACHE_TTL_HOURS", 1):
        assert projection_file_cache.read_json(expired) is None
    assert not expired.exists()

    oversized = tmp_path / "projections" / "charts" / "large.json"
    oversized.write_text('{"value": "large"}', encoding="utf-8")
    with patch.object(projection_file_cache, "PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES", 4):
        assert projection_file_cache.read_json(oversized) is None
    assert not oversized.exists()


def test_write_evicts_oldest_json_and_preserves_new_entry(tmp_path: Path) -> None:
    root = tmp_path / "projections"
    first = root / "charts" / "first.json"
    second = root / "abundance" / "second.json"
    with patch.object(projection_file_cache, "PROJECTION_FILE_CACHE_MAX_FILES", 1), patch.object(
        projection_file_cache, "PROJECTION_FILE_CACHE_MAX_TOTAL_BYTES", 1024
    ):
        assert projection_file_cache.write_json(first, {"value": 1})
        assert projection_file_cache.write_json(second, {"value": 2})
    assert not first.exists()
    assert projection_file_cache.read_json(second) == {"value": 2}


def test_oversized_write_is_skipped_without_partial_file(tmp_path: Path) -> None:
    path = tmp_path / "projections" / "charts" / "large.json"
    with patch.object(projection_file_cache, "PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES", 8):
        assert not projection_file_cache.write_json(path, {"value": "too large"})
    assert not path.exists()
    if path.parent.exists():
        assert list(path.parent.glob("*.tmp")) == []


def test_write_cannot_exceed_the_total_cache_limit(tmp_path: Path) -> None:
    path = tmp_path / "projections" / "charts" / "larger-than-total.json"
    with patch.object(projection_file_cache, "PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES", 1024), patch.object(
        projection_file_cache, "PROJECTION_FILE_CACHE_MAX_TOTAL_BYTES", 16
    ):
        assert not projection_file_cache.write_json(path, {"value": "too large for total"})
    assert not path.exists()
