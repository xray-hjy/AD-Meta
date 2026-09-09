from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.core.config import (
    PROJECTION_CACHE_TTL_HOURS,
    PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES,
    PROJECTION_FILE_CACHE_MAX_FILES,
    PROJECTION_FILE_CACHE_MAX_TOTAL_BYTES,
)


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except (FileNotFoundError, OSError):
        pass


def read_json(path: Path | None) -> Any | None:
    if path is None:
        return None
    try:
        stat = path.stat()
        expired = time.time() - stat.st_mtime > PROJECTION_CACHE_TTL_HOURS * 3600
        if expired or stat.st_size > PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES:
            _remove(path)
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def prune_json_files(root: Path, preserve: Path | None = None) -> int:
    now = time.time()
    entries: list[tuple[Path, int, float]] = []
    removed = 0
    try:
        paths = list(root.rglob("*.json"))
    except OSError:
        return 0
    for path in paths:
        try:
            stat = path.stat()
        except (FileNotFoundError, OSError):
            continue
        if path != preserve and (
            now - stat.st_mtime > PROJECTION_CACHE_TTL_HOURS * 3600
            or stat.st_size > PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES
        ):
            _remove(path)
            removed += 1
            continue
        entries.append((path, stat.st_size, stat.st_mtime))

    total = sum(size for _, size, _ in entries)
    count = len(entries)
    for path, size, _ in sorted(entries, key=lambda item: item[2]):
        if count <= PROJECTION_FILE_CACHE_MAX_FILES and total <= PROJECTION_FILE_CACHE_MAX_TOTAL_BYTES:
            break
        if path == preserve:
            continue
        _remove(path)
        total -= size
        count -= 1
        removed += 1
    return removed


def write_json(path: Path | None, payload: Any) -> bool:
    if path is None:
        return False
    encoded = json.dumps(payload, ensure_ascii=False)
    encoded_size = len(encoded.encode("utf-8"))
    if encoded_size > min(
        PROJECTION_FILE_CACHE_MAX_ENTRY_BYTES,
        PROJECTION_FILE_CACHE_MAX_TOTAL_BYTES,
    ):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(path)
    except OSError:
        return False
    finally:
        _remove(temporary)
    prune_json_files(path.parents[1], preserve=path)
    return True
