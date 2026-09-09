from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from app.cli import import_dataset as import_module
from app.core import database
from app.domain.analysis_scope import AbundanceProjectionRequest
from app.services import analysis_projection_service
from app.services.analysis_projection_service import project_abundance
from app.services.analysis_run_service import sync_analysis_runs_from_manifest
from app.services.full_result_service import stream_complete_results_csv


@pytest.mark.skipif(
    os.getenv("AD_META_CI_MYSQL_INTEGRATION") != "1",
    reason="requires the disposable CI MySQL database",
)
def test_mysql_import_revision_binding_and_projection(tmp_path: Path) -> None:
    assert database.DB_ENGINE == "mysql"
    source = tmp_path / "ko.csv"
    source.write_text(
        "Sample,Group,K00001,K00002\n"
        "AD1,AD,2,1\nAD2,AD,3,1\nNC1,NC,1,3\nNC2,NC,1,2\n",
        encoding="utf-8",
    )
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({
        "manifestVersion": "1.0",
        "analysisRuns": [{
            "key": "mysql-live-run",
            "name": "MySQL live run",
            "pipeline": {"name": "ci", "version": "1"},
            "artifacts": [{
                "key": "ko",
                "type": "ko_abundance",
                "datasetSlug": "mysql-live-dataset",
            }],
        }],
    }), encoding="utf-8")

    try:
        with patch.object(import_module, "CACHE_ROOT", tmp_path / "cache"), patch.object(
            import_module, "_relative_to_backend", lambda path: str(path)
        ), patch.object(
            analysis_projection_service, "CACHE_ROOT", tmp_path / "cache"
        ):
            import_module.import_dataset(source, "mysql-live-dataset", "MySQL live dataset")
            sync_analysis_runs_from_manifest(manifest)
            projection = project_abundance(
                "mysql-live-run", "ko", AbundanceProjectionRequest(topN=2)
            )
        assert projection["datasetSlug"] == "mysql-live-dataset"
        assert projection["payload"]["items"]
        assert projection["datasetRevision"]
        assert list((tmp_path / "cache" / "projections").rglob("*.json"))
        exported = b"".join(
            stream_complete_results_csv("mysql-live-run", "ko")
        ).decode("utf-8-sig")
        assert "K00001" in exported
    finally:
        with database.connect() as conn:
            conn.execute("DELETE FROM analysis_runs WHERE run_key = ?", ("mysql-live-run",))
            conn.execute("DELETE FROM datasets WHERE slug = ?", ("mysql-live-dataset",))
