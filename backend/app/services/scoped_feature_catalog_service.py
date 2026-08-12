from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from threading import Lock, RLock
from typing import Sequence

import numpy as np
import pandas as pd

from app.core import database
from app.core.config import CACHE_ROOT, COMPUTE_VERSION

SCOPED_FEATURE_CATALOG_SCHEMA = "1.0"
SCOPED_FEATURE_CATALOG_CACHE_SIZE = 16


@dataclass(frozen=True)
class ScopedFeatureEntry:
    feature_id: str
    full_name: str
    display_name: str
    mean_abundance: float
    rank: int
    detected_sample_count: int
    prevalence: float

    def as_payload(self) -> dict[str, str | int | float]:
        return {
            "featureId": self.feature_id,
            "fullName": self.full_name,
            "shortName": self.display_name,
            "rank": self.rank,
            "meanAbundance": self.mean_abundance,
            "detectedSampleCount": self.detected_sample_count,
            "prevalence": self.prevalence,
        }


@dataclass(frozen=True)
class ScopedFeatureCatalog:
    identity_key: str
    sample_ids: tuple[int, ...]
    entries: tuple[ScopedFeatureEntry, ...]

    @property
    def by_id(self) -> dict[str, ScopedFeatureEntry]:
        return {entry.feature_id: entry for entry in self.entries}

    @property
    def ranked(self) -> tuple[ScopedFeatureEntry, ...]:
        return tuple(sorted(self.entries, key=lambda entry: (entry.rank, entry.full_name)))


_catalog_cache: OrderedDict[str, ScopedFeatureCatalog] = OrderedDict()
_catalog_cache_lock = RLock()


@lru_cache(maxsize=128)
def _catalog_build_lock(identity_key: str) -> Lock:
    return Lock()


def _catalog_identity(
    *,
    revision_id: int,
    revision_key: str,
    feature_kind: str,
    sample_ids: Sequence[int],
) -> tuple[str, tuple[int, ...]]:
    normalized_sample_ids = tuple(sorted({int(sample_id) for sample_id in sample_ids}))
    identity = {
        "schemaVersion": SCOPED_FEATURE_CATALOG_SCHEMA,
        "computeVersion": COMPUTE_VERSION,
        "revisionId": int(revision_id),
        "revisionKey": str(revision_key),
        "featureKind": str(feature_kind),
        "sampleIds": normalized_sample_ids,
    }
    identity_key = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return identity_key, normalized_sample_ids


def _catalog_cache_path(identity_key: str, persistent: bool) -> Path | None:
    if not persistent or database.DB_ENGINE != "mysql":
        return None
    return CACHE_ROOT / "projections" / "feature-catalogs" / f"{identity_key}.npz"


def _read_catalog(
    path: Path | None,
    identity_key: str,
    sample_ids: tuple[int, ...],
) -> ScopedFeatureCatalog | None:
    if path is None:
        return None
    try:
        with np.load(path, allow_pickle=False) as payload:
            feature_ids = payload["feature_ids"].astype(str).tolist()
            full_names = payload["full_names"].astype(str).tolist()
            display_names = payload["display_names"].astype(str).tolist()
            means = payload["means"].astype(float).tolist()
            ranks = payload["ranks"].astype(np.int64).tolist()
            detected_counts = payload["detected_counts"].astype(np.int64).tolist()
            prevalence = payload["prevalence"].astype(float).tolist()
    except (FileNotFoundError, OSError, ValueError, KeyError):
        return None
    lengths = {
        len(feature_ids), len(full_names), len(display_names), len(means),
        len(ranks), len(detected_counts), len(prevalence),
    }
    if len(lengths) != 1:
        return None
    return ScopedFeatureCatalog(
        identity_key=identity_key,
        sample_ids=sample_ids,
        entries=tuple(
            ScopedFeatureEntry(
                feature_id=str(feature_id),
                full_name=str(full_name),
                display_name=str(display_name),
                mean_abundance=float(mean),
                rank=int(rank),
                detected_sample_count=int(detected_count),
                prevalence=float(rate),
            )
            for feature_id, full_name, display_name, mean, rank, detected_count, rate in zip(
                feature_ids,
                full_names,
                display_names,
                means,
                ranks,
                detected_counts,
                prevalence,
                strict=True,
            )
        ),
    )


def _write_catalog(path: Path | None, catalog: ScopedFeatureCatalog) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.tmp.npz")
    try:
        with temporary.open("wb") as handle:
            np.savez(
                handle,
                feature_ids=np.asarray([entry.feature_id for entry in catalog.entries]),
                full_names=np.asarray([entry.full_name for entry in catalog.entries]),
                display_names=np.asarray([entry.display_name for entry in catalog.entries]),
                means=np.asarray([entry.mean_abundance for entry in catalog.entries], dtype=float),
                ranks=np.asarray([entry.rank for entry in catalog.entries], dtype=np.int64),
                detected_counts=np.asarray(
                    [entry.detected_sample_count for entry in catalog.entries], dtype=np.int64
                ),
                prevalence=np.asarray([entry.prevalence for entry in catalog.entries], dtype=float),
            )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def get_scoped_feature_catalog(
    *,
    revision_id: int,
    revision_key: str,
    feature_kind: str,
    sample_ids: Sequence[int],
    matrix: pd.DataFrame,
    feature_names: Sequence[str],
    feature_ids: Sequence[str],
    display_names: Sequence[str],
    persistent: bool,
) -> ScopedFeatureCatalog:
    metadata_lengths = {
        len(matrix.columns),
        len(feature_names),
        len(feature_ids),
        len(display_names),
    }
    if len(metadata_lengths) != 1:
        raise ValueError(
            "Scoped feature catalog feature metadata must align with matrix columns."
        )
    identity_key, normalized_sample_ids = _catalog_identity(
        revision_id=revision_id,
        revision_key=revision_key,
        feature_kind=feature_kind,
        sample_ids=sample_ids,
    )
    with _catalog_cache_lock:
        cached = _catalog_cache.get(identity_key)
        if cached is not None:
            _catalog_cache.move_to_end(identity_key)
            return cached

    with _catalog_build_lock(identity_key):
        with _catalog_cache_lock:
            cached = _catalog_cache.get(identity_key)
            if cached is not None:
                _catalog_cache.move_to_end(identity_key)
                return cached
        path = _catalog_cache_path(identity_key, persistent)
        catalog = _read_catalog(path, identity_key, normalized_sample_ids)
        if catalog is None:
            scoped = matrix.reindex(normalized_sample_ids, fill_value=0.0)
            values = scoped.to_numpy(dtype=float, copy=False)
            means = values.mean(axis=0) if len(scoped) else np.zeros(len(feature_names), dtype=float)
            detected_counts = (
                np.count_nonzero(values > 0, axis=0)
                if len(scoped)
                else np.zeros(len(feature_names), dtype=np.int64)
            )
            order = np.argsort(-means, kind="stable")
            ranks = np.empty(len(feature_names), dtype=np.int64)
            ranks[order] = np.arange(1, len(feature_names) + 1, dtype=np.int64)
            sample_count = len(scoped)
            catalog = ScopedFeatureCatalog(
                identity_key=identity_key,
                sample_ids=normalized_sample_ids,
                entries=tuple(
                    ScopedFeatureEntry(
                        feature_id=str(feature_id),
                        full_name=str(full_name),
                        display_name=str(display_name),
                        mean_abundance=float(means[index]),
                        rank=int(ranks[index]),
                        detected_sample_count=int(detected_counts[index]),
                        prevalence=float(detected_counts[index] / sample_count) if sample_count else 0.0,
                    )
                    for index, (feature_id, full_name, display_name) in enumerate(
                        zip(feature_ids, feature_names, display_names, strict=True)
                    )
                ),
            )
            _write_catalog(path, catalog)

        with _catalog_cache_lock:
            _catalog_cache[identity_key] = catalog
            _catalog_cache.move_to_end(identity_key)
            while len(_catalog_cache) > SCOPED_FEATURE_CATALOG_CACHE_SIZE:
                _catalog_cache.popitem(last=False)
        return catalog


def _search_priority(name: str, query: str) -> int | None:
    normalized_name = str(name).casefold()
    normalized_query = str(query).casefold().strip()
    if not normalized_query:
        return 0
    if normalized_name == normalized_query:
        return 0
    if normalized_name.startswith(normalized_query):
        return 1
    tokens = [token for token in re.split(r"[^0-9a-z]+", normalized_name) if token]
    if any(token.startswith(normalized_query) for token in tokens):
        return 2
    if normalized_query in normalized_name:
        return 3
    return None


def search_scoped_feature_catalog(
    catalog: ScopedFeatureCatalog,
    *,
    query: str = "",
    feature_ids: Sequence[str] = (),
) -> list[ScopedFeatureEntry]:
    if feature_ids:
        by_id = catalog.by_id
        return [by_id[str(feature_id)] for feature_id in feature_ids if str(feature_id) in by_id]
    if not query.strip():
        return list(catalog.ranked)
    scored: list[tuple[int, int, str, ScopedFeatureEntry]] = []
    for entry in catalog.entries:
        priorities = [
            priority
            for priority in (
                _search_priority(entry.display_name, query),
                _search_priority(entry.full_name, query),
            )
            if priority is not None
        ]
        if priorities:
            scored.append((min(priorities), entry.rank, entry.full_name, entry))
    scored.sort(key=lambda item: item[:3])
    return [entry for _, _, _, entry in scored]


def clear_scoped_feature_catalog_cache() -> None:
    with _catalog_cache_lock:
        _catalog_cache.clear()
    _catalog_build_lock.cache_clear()


__all__ = [
    "ScopedFeatureCatalog",
    "ScopedFeatureEntry",
    "clear_scoped_feature_catalog_cache",
    "get_scoped_feature_catalog",
    "search_scoped_feature_catalog",
]
