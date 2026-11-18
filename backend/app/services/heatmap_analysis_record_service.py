"""Persist complete MWU records independently of visual/display choices."""

import hashlib
import json
from functools import lru_cache
from threading import Lock

from app.compute.charts.heatmap import analyze_heatmap, heatmap_analysis_key
from app.core.config import COMPUTE_VERSION
from app.services.projection_audit_repository import (
    AuditArtifactIdentity,
    begin_audit_artifact,
    complete_audit_artifact,
    fail_audit_artifact,
    find_audit_artifact,
    load_audit_rows,
)


@lru_cache(maxsize=128)
def _lock(artifact_id, key):
    return Lock()


def get_heatmap_analysis(run_id, artifact_id, revision, frame, features, parameters):
    kwargs = {
        "prefilter": parameters["prefilter"],
        "minimum_prevalence": parameters["minimumPrevalence"],
        "detection_threshold": parameters["detectionThreshold"],
    }
    key = heatmap_analysis_key(frame, features, **kwargs)
    identity = AuditArtifactIdentity(
        run_id=run_id,
        source_artifact_id=artifact_id,
        projection_key=key,
        projection_kind="heatmap",
        section_key="analysis_record",
        source_revision_key=revision,
        compute_version=COMPUTE_VERSION,
    )
    with _lock(artifact_id, key):
        stored = find_audit_artifact(identity)
        if stored and stored["status"] == "ready":
            return stored["metadata"]["analysisRecord"], load_audit_rows(int(stored["id"]))
        record, rows = analyze_heatmap(frame, features, **kwargs)
        record.update(datasetRevision=revision, sourceArtifactId=artifact_id, analysisRunId=run_id)
        storage_id = begin_audit_artifact(identity, retention_class="analysis_record", expires_at=None)
        record["storageId"] = storage_id
        digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        record["statisticsSha256"] = digest
        try:
            complete_audit_artifact(storage_id, rows=rows, metadata={"analysisRecord": record}, sha256=digest)
        except Exception as exc:
            fail_audit_artifact(storage_id, exc)
            raise
        return record, rows
