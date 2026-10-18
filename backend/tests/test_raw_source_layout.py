"""Read-only checks for type/source input folders; never import live datasets."""
import hashlib
import json
from pathlib import Path

import pytest

from app.cli.bootstrap_storage import BACKEND_ROOT, _resolve_raw_file, load_manifest


def test_current_manifest_inputs_exist_under_their_source_project():
    for dataset in load_manifest():
        project = dataset["source"]["projectAccession"]
        for field in ("file", "sampleMetadataFile", "pathwayFile"):
            if not dataset.get(field):
                continue
            path = _resolve_raw_file(dataset[field], BACKEND_ROOT)
            assert path.is_file(), path
            assert path.parent.name == project
            assert path.is_relative_to(BACKEND_ROOT / "storage/raw")


@pytest.mark.parametrize("filename", ["gmrepo_primary_context.json", "gmrepo_research_registry.json"])
def test_supplement_source_records_still_match_original_bytes(filename):
    record = json.loads((BACKEND_ROOT / "metadata" / filename).read_text(encoding="utf-8"))
    supplements = [source for source in record["sources"] if source["sourceId"] in {
        "primary-study-method-supplement", "primary-study-sample-supplement",
    }]
    assert len(supplements) == 2
    for source in supplements:
        path = BACKEND_ROOT.parent / source["path"]
        content = path.read_bytes()
        assert len(content) == source["bytes"]
        assert hashlib.sha256(content).hexdigest() == source["sha256"]
        assert path.parent.parent.name == "source-supplements"


def test_different_source_folders_resolve_without_implicit_merging():
    root = Path("backend").resolve()
    first = _resolve_raw_file("storage/raw/ad-nc-species/PROJECT-A/raw.csv", root)
    second = _resolve_raw_file("storage/raw/ad-nc-species/PROJECT-B/raw.csv", root)
    assert first != second
    assert first.parent.name == "PROJECT-A"
    assert second.parent.name == "PROJECT-B"
