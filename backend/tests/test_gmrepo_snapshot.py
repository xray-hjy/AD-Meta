import hashlib
import json
from copy import deepcopy

import pytest
import test_gmrepo_ledger as fixtures
from fastapi.testclient import TestClient

from app.cli import inventory_gmrepo as inventory
from app.main import app
from app.services import gmrepo_evaluation_service as evaluation
from app.services import gmrepo_snapshot_service as snapshots

cohort = fixtures.cohort
registered = fixtures.registered


@pytest.fixture
def frozen(registered, tmp_path, monkeypatch):
    data, registry, payload = registered
    monkeypatch.setattr(snapshots, "SNAPSHOT_ROOT", tmp_path / "snapshots")
    record = evaluation.evidence_summary(data, "NCBI:816")
    package = snapshots.freeze(record)
    return data, registry, payload, record, package


def test_repeat_download_keeps_id_timestamp_and_values(frozen):
    _, _, _, record, first = frozen
    record["generatedAt"] = "a later download time"
    second = snapshots.freeze(record)
    assert first == second
    assert snapshots.load(first["evaluationId"]) == first
    altered = deepcopy(first)
    altered["payload"]["evaluation"]["cohorts"][0]["statistic"]["qValue"] = 0
    with pytest.raises(ValueError):
        snapshots.validate_package(altered)


def test_html_export_with_a_matching_hash_cannot_replace_a_discovery_index(tmp_path):
    raw = b"<!doctype html><html>Application fallback</html>"
    (tmp_path / "projects.tsv").write_bytes(raw)
    target = tmp_path / "published.json"
    target.write_text('{"previous":"valid"}')
    result = {"referenceFingerprint": "reference", "projects": [{"projectId": "PRJTEST1"}],
              "scopes": [{"paginationComplete": True, "expectedRuns": 1, "retrievedRuns": 1}],
              "queries": [{"file": "projects.tsv", "status": "retrieved", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}]}
    with pytest.raises(ValueError, match="TSV schema"):
        inventory.publish_candidate(result, tmp_path, target)
    assert target.read_text() == '{"previous":"valid"}'


def test_json_number_normalization_survives_browser_reserialization():
    assert snapshots.digest({"q": 1.0, "zero": -0.0, "small": 1e-20}) == snapshots.digest({"q": 1, "zero": 0, "small": 0.00000000000000000001})
    assert snapshots.digest(1) != snapshots.digest("1")
    assert snapshots.digest(1) != snapshots.digest(["number", "1"])
    with pytest.raises(ValueError):
        snapshots.digest(2**53 + 1)
    with pytest.raises(ValueError):
        snapshots.digest(float("nan"))


def test_updated_registry_marks_history_without_rewriting_results(frozen):
    data, path, payload, _, package = frozen
    assert snapshots.current_status(package, data)["status"] == "current"
    payload["purpose"] = "new documented scope"
    path.write_text(json.dumps(payload))
    status = snapshots.current_status(package, data)
    assert status["status"] == "historical" and status["currentUse"] == "requires_reevaluation"
    assert snapshots.load(package["evaluationId"]) == package


def test_fixed_api_report_and_package_reject_missing_or_mismatched_objects(frozen):
    data, _, _, _, package = frozen
    client = TestClient(app)
    record = client.get("/api/references/gmrepo/evidence-summary", params={"genus": "NCBI:816", "revision": data.fingerprint}).json()
    key = record["evaluationId"]
    downloaded = client.get("/api/references/gmrepo/evaluation-package", params={"evaluationId": key})
    assert downloaded.status_code == 200
    snapshots.validate_package(downloaded.json())
    report = client.get("/api/references/gmrepo/report", params={"genus": "NCBI:816", "evaluationId": key})
    assert report.status_code == 200 and key in report.text and "direction_conflict" not in report.text  # explanation uses human-readable text
    assert client.get("/api/references/gmrepo/report", params={"genus": "NCBI:570", "evaluationId": key}).status_code == 422
    assert client.get("/api/references/gmrepo/report", params={"genus": "NCBI:816", "evaluationId": "0" * 64}).status_code == 422
    assert package["payload"]["evaluation"]["claims"][1]["kind"] == "direction_conflict"


def test_identity_revocation_blocks_current_use_but_preserves_historical_q(frozen):
    data, path, payload, record, package = frozen
    payload["reviews"] = [{"reviewId": "synthetic-hold", "projectId": "PRJTEST1", "purpose": "identity", "decision": "revoked",
                           "allRunSetSha256": record["cohorts"][0]["audit"]["allRunSetSha256"], "note": "Synthetic test only",
                           "reviewer": "Test reviewer", "reviewedOn": "2026-10-15", "evidenceRefs": ["test-evidence"]}]
    path.write_text(json.dumps(payload))
    assert snapshots.current_status(package, data)["currentUse"] == "blocked"
    assert snapshots.load(package["evaluationId"])["payload"]["evaluation"]["cohorts"][0]["statistic"] == record["cohorts"][0]["statistic"]


def test_declared_missing_supplement_does_not_invalidate_usable_reference(registered, tmp_path, monkeypatch):
    data, registry, payload = registered
    source_path = data.root / "not-yet-acquired.json"
    payload["sources"] = [{"sourceId": "missing-supplement", "url": "https://example.test/supplement", "path": source_path.name,
                           "sha256": hashlib.sha256(b"source").hexdigest(), "bytes": 6, "origin": "sealed_package"}]
    registry.write_text(json.dumps(payload))
    monkeypatch.setattr(snapshots, "SNAPSHOT_ROOT", tmp_path / "snapshots")
    record = evaluation.evidence_summary(data, "NCBI:816")
    package = snapshots.freeze(record)
    assert snapshots.current_status(package, data)["status"] == "current"
    assert record["cohorts"][0]["audit"]["unadjustedStatus"] == "eligible"
    source_path.write_bytes(b"source")
    assert snapshots.current_status(package, data)["status"] == "historical"
    assert snapshots.current_status(package, data)["currentUse"] == "requires_reevaluation"


@pytest.mark.parametrize("failure", ["pagination", "source_error", "corrupt_receipt"])
def test_bad_candidate_never_overwrites_published_inventory(tmp_path, monkeypatch, failure):
    backend = tmp_path / "backend"
    backend.mkdir()
    monkeypatch.setattr(inventory, "BACKEND_ROOT", backend)
    output = tmp_path / "batch"
    output.mkdir()
    target = backend / "registry.json"
    target.write_bytes(b'{"previous":"valid"}')
    (output / "page.json").write_bytes(b"[]")
    candidate = {"referenceFingerprint": "ref", "projects": [{"projectId": "PRJTEST1"}], "errors": [],
                 "scopes": [{"paginationComplete": True, "expectedRuns": 1, "retrievedRuns": 1}],
                 "queries": [{"file": "page.json", "status": "retrieved", "bytes": 2, "sha256": hashlib.sha256(b"[]").hexdigest()}]}
    if failure == "pagination":
        candidate["scopes"][0]["paginationComplete"] = False
    elif failure == "source_error":
        candidate["errors"] = ["source returned 1002"]
    else:
        (output / "page.json").write_bytes(b"changed")
    with pytest.raises(ValueError):
        inventory.publish_candidate(candidate, output, target)
    assert target.read_bytes() == b'{"previous":"valid"}'
