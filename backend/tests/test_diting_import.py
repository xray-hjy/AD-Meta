"""DiTing's paired outputs must preserve values and revision identity."""
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api import diting
from app.cli import import_dataset as importer
from app.compute.table import InputValidationError
from app.core import database
from app.services import diting_matrix
from app.services.analysis_projection_service import _abundance_aggregates
from app.services.diting_import import normalize_diting


def inputs(root: Path):
    ko, meta, pathways = root / "ko.tab", root / "samples.tsv", root / "pathways.tab"
    meta.write_text("sample_id\tGroup\nCRR3\tNC\nCRR1\tAD\nCRR4\tNC\nCRR2\tAD\n", encoding="utf-8")
    ko.write_text("k_number\tCRR1\tCRR2\tCRR3\tCRR4\nK00001\t1000\t2000\t0\t5\nDddP\t1\t2\t3\t4\n", encoding="utf-8")
    pathways.write_text("#Pathway\tCRR4\tCRR3\tCRR2\tCRR1\nAD high\t0\t0\t2000\t1000\nNC high\t10\t5\t0\t0\nAll zero\t0\t0\t0\t0\n", encoding="utf-8")
    return ko, meta, pathways


def test_keyed_alignment_original_scale_and_effect_direction(tmp_path):
    ko, meta, pathways = inputs(tmp_path)
    matrix, report, payload = normalize_diting(ko, meta, pathways)
    assert matrix.sample_id.tolist() == ["CRR3", "CRR1", "CRR4", "CRR2"]
    assert matrix.K00001.tolist() == [0, 1000, 5, 2000]
    assert report["additionalFunctionalGenes"] == ["DddP"]
    high, low, zero = payload["items"]
    assert high["values"] == [0, 1000, 0, 2000]
    assert (high["effect"], low["effect"], zero["effect"]) == (1, -1, 0)
    assert high["ci"] == [1, 1]
    assert zero["ci"] == [0, 0]
    assert zero["pValue"] == zero["qValue"] == 1
    assert all(0 <= item["pValue"] <= item["qValue"] <= 1 for item in payload["items"])


@pytest.mark.parametrize("bad", ["missing_sample", "duplicate_feature", "negative", "nan"])
def test_bad_paired_pathway_source_is_rejected(tmp_path, bad):
    ko, meta, pathways = inputs(tmp_path)
    content = pathways.read_text(encoding="utf-8")
    if bad == "missing_sample":
        content = content.replace("CRR4", "CRR9")
    elif bad == "duplicate_feature":
        content = content.replace("NC high", "AD high")
    elif bad == "negative":
        content = content.replace("2000", "-1")
    else:
        content = content.replace("2000", "nan")
    pathways.write_text(content, encoding="utf-8")
    with pytest.raises(InputValidationError):
        normalize_diting(ko, meta, pathways)


def test_revision_bundle_and_download_checksums(tmp_path):
    ko, meta, pathways = inputs(tmp_path)
    original = ko.read_bytes()
    with patch.object(database, "DB_ENGINE", "sqlite"), patch.object(database, "DB_PATH", tmp_path / "db.sqlite"), \
         patch.object(importer, "CACHE_ROOT", tmp_path / "cache"), \
         patch.object(importer, "_relative_to_backend", str), \
         patch.object(diting_matrix, "_resolve_cache_path", Path), \
         patch.object(diting, "_resolve_cache_path", Path):
        importer.import_dataset(ko, "functions", "Functions", abundance_scale="normalized_abundance",
                                input_format="diting_ko", sample_metadata_file=meta, pathway_file=pathways)
        revision_path = next((tmp_path / "cache" / "functions").iterdir())
        payload = diting.pathways("functions", revision_path.name)
        assert payload["revision"] == revision_path.name
        with database.connect() as conn:
            revision_id = conn.execute('SELECT id FROM dataset_revisions WHERE revision_key=?', (revision_path.name,)).fetchone()['id']
            artifact = {"dataset_revision_id": revision_id, "revision_key": revision_path.name, "feature_kind": "ko"}
            matrix, samples = diting_matrix.revision_diting_matrix(conn, artifact)
            assert matrix.shape == (4, 1)
            ids = {group: tuple(key for key, value in samples.items() if value[1] == group) for group in ["AD", "NC"]}
            aggregate = _abundance_aggregates(conn, artifact, ids)
            assert {item['series_key']: item['total'] for item in aggregate} == {"AD": 3000, "NC": 5}
        assert (revision_path / "raw.tab").read_bytes() == original
        assert diting.download("functions", revision_path.name, "ko").filename == "ko_abundance_among_samples.tab"
        with pytest.raises(HTTPException) as error:
            diting.pathways("functions", "missing-revision")
        assert error.value.status_code == 404
        (revision_path / "pathways_relative_abundance.tab").write_text("tampered", encoding="utf-8")
        with pytest.raises(HTTPException) as error:
            diting.download("functions", revision_path.name, "pathways")
        assert error.value.status_code == 503
        cached = json.loads((revision_path / "diting_pathways.json").read_text(encoding="utf-8"))
        assert cached["preprocessing"]["additionalFunctionalGenes"] == ["DddP"]
        diting_matrix._source_matrix.cache_clear()
        (revision_path / "raw.tab").write_text("tampered", encoding="utf-8")
        with database.connect() as conn, pytest.raises(ValueError, match="checksum mismatch"):
            diting_matrix.revision_diting_matrix(conn, artifact)
