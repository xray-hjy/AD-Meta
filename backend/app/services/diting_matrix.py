"""Replay a verified DiTing revision snapshot for scoped functional charts."""
from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.services.dataset_service import _resolve_cache_path
from app.services.diting_import import read_profile


@lru_cache(maxsize=4)
def _source_matrix(raw_path: str, raw_sha: str, metadata_path: str, metadata_sha: str):
    raw, meta = Path(raw_path), Path(metadata_path)
    if hashlib.sha256(raw.read_bytes()).hexdigest() != raw_sha:
        raise ValueError("DiTing KO revision source checksum mismatch")
    if hashlib.sha256(meta.read_bytes()).hexdigest() != metadata_sha:
        raise ValueError("DiTing sample snapshot checksum mismatch")
    names, values, metadata = read_profile(raw, meta, "k_number")
    selected = [i for i, name in enumerate(names) if re.fullmatch(r"K\d{5}", name)]
    frame = pd.DataFrame(values[selected].T, index=metadata.sample_id, columns=[names[i] for i in selected])
    return frame, dict(zip(metadata.sample_id, metadata.Group, strict=True))


def revision_diting_matrix(conn, artifact):
    """Return None for other sources; never substitute the current revision."""
    row = conn.execute("""
        SELECT r.source_json, r.source_sha256, a.cache_path
        FROM dataset_revisions r JOIN revision_chart_artifacts a ON a.revision_id=r.id
        WHERE r.id=? AND r.revision_key=? AND r.status='published'
          AND a.chart_type='diting_pathways'
    """, (artifact["dataset_revision_id"], artifact["revision_key"])).fetchone()
    if row is None:
        return None
    source = json.loads(row["source_json"])
    report = source.get("preprocessing", {})
    if report.get("format") != "diting_ko":
        return None
    directory = _resolve_cache_path(row["cache_path"]).parent
    frame, groups = _source_matrix(str(directory / "raw.tab"), row["source_sha256"],
                                   str(directory / "sample_metadata.tsv"), report["sampleMetadataSha256"])
    samples = conn.execute("""SELECT sample_id,sample_code,phenotype FROM revision_sample_info
                              WHERE revision_id=? ORDER BY sample_id""", (artifact["dataset_revision_id"],)).fetchall()
    if set(frame.index) != {sample["sample_code"] for sample in samples}:
        raise ValueError("DiTing snapshot differs from revision sample index")
    if any(groups[sample["sample_code"]] != sample["phenotype"] for sample in samples):
        raise ValueError("DiTing snapshot group differs from revision sample index")
    mapping = {int(sample["sample_id"]): (sample["sample_code"], sample["phenotype"]) for sample in samples}
    result = frame.loc[[sample["sample_code"] for sample in samples]].copy()
    result.index = list(mapping)
    return result, mapping
