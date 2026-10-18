import hashlib
import json

import pytest
import test_gmrepo_analysis as fixtures
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_evaluation_service as evaluation
from app.services import gmrepo_ledger_service as ledger
from app.services.gmrepo_ledger_models import ResearchLedger, ResearchRegistry

cohort = fixtures.cohort


@pytest.fixture
def registered(cohort, tmp_path, monkeypatch):
    data, _ = cohort
    payload = {"schemaVersion": 1, "version": "test-ledger", "recordedOn": "2026-10-15", "referenceFingerprint": data.fingerprint,
               "scopeMode": "retrospective_harmonization", "purpose": "test", "searchScope": ["AD/NC"],
               "projects": [{"projectId": "PRJTEST1"}, {"projectId": "PRJTEST2"}], "reviews": []}
    path = tmp_path / "ledger.json"
    path.write_text(json.dumps(payload))
    monkeypatch.setattr(ledger, "REGISTRY_PATH", path)
    monkeypatch.setattr(ledger, "LEGACY_REVIEW_PATH", data.root / "review.json")
    found = tmp_path / "discovery.json"
    found.write_text(json.dumps({"status": "partial", "referenceFingerprint": data.fingerprint, "projects": [
        {"projectId": "PRJTEST2", "originalDescription": "AD clinical stools? unreviewed", "phenotypes": ["D060825"]}], "queries": []}))
    monkeypatch.setattr(ledger, "DISCOVERY_PATH", found)
    monkeypatch.setattr(evaluation.primary, "primary_evidence", lambda *_: {"status": "unavailable", "reasons": ["待核查"]})
    return data, path, payload


def test_schema_rejects_unsigned_decisions_and_unsupported_study_assertions(registered):
    data, _, payload = registered
    payload["reviews"] = [{"reviewId": "x", "projectId": "PRJTEST1", "purpose": "identity", "decision": "confirmed",
                           "allRunSetSha256": ledger.run_set_digest(list(data.samples)), "note": "not a real review"}]
    with pytest.raises(ValidationError):
        ResearchRegistry.model_validate(payload)
    payload["reviews"] = []
    payload["projects"][0]["country"] = "guessed"
    with pytest.raises(ValidationError):
        ResearchRegistry.model_validate(payload)


def test_discovery_is_not_authorization_and_unknowns_remain_unknown(registered):
    data, _, _ = registered
    resources = evaluation.resources(data)
    result = ResearchLedger.model_validate(resources["researchLedger"])
    assert result.counts == {"registeredProjects": 2, "installedProjects": 1, "discoveredNotInstalled": 1}
    assert resources["items"][0]["unadjustedStatus"] == "eligible"
    pending = next(r for r in result.records if r.projectId == "PRJTEST2")
    assert pending.studyId is None and pending.fields["country"].value is None
    assert pending.fields["material"].value is None
    assert pending.fields["originalDescription"].rawValue == "AD clinical stools? unreviewed"
    assert pending.capabilities["unadjusted"].status == "not_loaded"
    assert pending.comparison["metadataRuns"] is None and pending.comparison["status"] == "not_established"
    assert "NOT_INSTALLED" in {b.reasonCode for b in pending.blockers}
    assert result.scientificReviewStatus == "pending"


def test_changed_discovery_receipt_suspends_coverage_without_disabling_sealed_reference(registered):
    data, _, _ = registered
    found = json.loads(ledger.DISCOVERY_PATH.read_bytes())
    found.update(archivePath=str(ledger.DISCOVERY_PATH.parent), queries=[{"file": "missing-original.json", "status": "retrieved",
                                                                       "bytes": 2, "sha256": hashlib.sha256(b"{}").hexdigest()}])
    ledger.DISCOVERY_PATH.write_text(json.dumps(found))
    # Acquisition readback intentionally rejects missing/outside repository originals.
    assert ledger.discovery(data)["status"] == "source_unavailable_or_changed"
    assert ledger.discovery(data)["projects"] == []
    assert analysis.cohort_audit(data, "PRJTEST1")["unadjustedStatus"] == "eligible"


@pytest.mark.parametrize("purpose,decision", [("identity", "revoked"), ("unadjusted", "hold"), ("adjusted", "hold")])
def test_revocation_rechecks_warm_cache_and_propagates_to_all_outputs(registered, purpose, decision):
    data, path, payload = registered
    before = analysis.cohort_statistics(data, "PRJTEST1")
    assert before["audit"]["adjustedStatus"] == "eligible" and before["items"]
    payload["reviews"] = [{"reviewId": "test-only-revocation", "projectId": "PRJTEST1", "purpose": purpose, "decision": decision,
                           "allRunSetSha256": ledger.run_set_digest(list(data.samples)), "note": "Synthetic test decision",
                           "reviewer": "Synthetic test reviewer", "reviewedOn": "2026-10-15", "evidenceRefs": ["test-only"]}]
    path.write_text(json.dumps(payload))
    after = analysis.cohort_statistics(data, "PRJTEST1")
    assert after["audit"]["adjustedStatus"] == "blocked"
    assert after["audit"]["registryFingerprint"] != before["audit"]["registryFingerprint"]
    if purpose == "adjusted":
        assert after["audit"]["unadjustedStatus"] == "eligible"
        assert all(r["adjusted"] is None for r in after["items"])
        assert [r["qValue"] for r in after["items"]] == [r["qValue"] for r in before["items"]]
    else:
        assert after["items"] == []
    resources = evaluation.resources(data)
    summary = evaluation.evidence_summary(data, "NCBI:816")
    audit = analysis.audit_catalog(data)
    assert resources["protocol"]["discoveryStatus"] == summary["protocol"]["discoveryStatus"] == audit["protocol"]["discoveryStatus"] == "partial"
    assert resources["items"][0]["researchRecord"]["capabilities"] == summary["cohorts"][0]["researchRecord"]["capabilities"] == after["audit"]["capabilities"]
    report = evaluation.markdown_report(summary)
    assert after["audit"]["registryFingerprint"] in report
    assert ("REVIEW_REVOKED" if decision == "revoked" else "REVIEW_ON_HOLD") in report
    assert len(analysis.distribution(data, "PRJTEST1", "NCBI:816")["points"]) == 80


def test_invalid_registry_fails_closed_but_wrong_version_cannot_revoke(registered):
    data, path, payload = registered
    path.write_text("not-json")
    assert analysis.cohort_statistics(data, "PRJTEST1")["items"] == []
    payload["referenceFingerprint"] = "other-reference"
    path.write_text(json.dumps(payload))
    assert analysis.cohort_audit(data, "PRJTEST1")["unadjustedStatus"] == "eligible"


def test_new_audit_schema_survives_api_serialization(registered):
    data, _, _ = registered
    client = TestClient(app)
    result = client.get("/api/references/gmrepo/audit", params={"revision": data.fingerprint})
    assert result.status_code == 200
    audit = result.json()["items"][0]
    assert audit["capabilities"]["scientificReview"]["status"] == "pending"
    assert audit["allRunSetSha256"] == ledger.run_set_digest(list(data.samples))
    assert "INDEPENDENCE_UNREVIEWED" in {b["reasonCode"] for b in audit["blockers"]}


def test_profile_and_comparison_gates_remain_separate(registered):
    data, _, _ = registered
    for sample in data.samples:
        sample["analysis_decision"] = "stage_reference"
        sample["research_group"] = "MCI"
    data.samples[0]["profile_status"] = "source_profile_unavailable"
    record = ledger.project_record(data, "PRJTEST1", None)
    assert record["capabilities"]["profile"]["status"] == "partial"
    assert record["capabilities"]["metadata"]["status"] == "available"
    assert record["capabilities"]["distribution"]["status"] == "not_applicable"
    assert record["capabilities"]["unadjusted"]["status"] == "not_applicable"
    assert {"NO_AD_NC_COMPARISON", "PROFILE_INCOMPLETE"} <= {b["reasonCode"] for b in record["blockers"]}


def test_acquisition_status_requires_actual_read_back(tmp_path, monkeypatch):
    monkeypatch.setattr(ledger, "BACKEND_ROOT", tmp_path / "backend")
    path = tmp_path / "source.json"
    path.write_bytes(b"original")
    found = {"archivePath": str(tmp_path), "queries": [{"file": path.name, "status": "retrieved", "bytes": 8,
                                                        "sha256": hashlib.sha256(b"original").hexdigest()}]}
    assert ledger.acquisition_records(found)[0]["availability"] == "verified"
    path.write_bytes(b"changed")
    assert ledger.acquisition_records(found)[0]["availability"] == "integrity_error"
    found["queries"][0]["file"] = "missing.json"
    assert ledger.acquisition_records(found)[0]["availability"] == "unavailable"


def v2_registry(registered):
    data, path, payload = registered
    raw = (data.root / "identity.json").read_bytes()
    payload.update(schemaVersion=2, sources=[{"sourceId": "identity", "url": "https://example.test/identity", "path": "identity.json",
                                           "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "origin": "sealed_package"}])
    return data, path, payload


def signed_review(data, review_id="review-1", purpose="scientific_review", decision="confirmed", **extra):
    return {"reviewId": review_id, "projectId": "PRJTEST1", "purpose": purpose, "decision": decision,
            "allRunSetSha256": ledger.run_set_digest(list(data.samples)), "comparisonFingerprint": ledger.comparison_digest(data, "PRJTEST1"),
            "methodVersion": analysis.METHOD_VERSION, "note": "Synthetic test opinion, never production approval", "evidenceRefs": ["identity"],
            "reviewer": "Synthetic reviewer", "role": "test fixture", "reviewedOn": "2026-10-15", **extra}


def test_scoped_review_and_evidence_integrity_drive_status_without_granting_replication(registered):
    data, path, payload = v2_registry(registered)
    payload["reviews"] = [signed_review(data)]
    path.write_text(json.dumps(payload))
    before = ledger.project_record(data, "PRJTEST1", analysis.cohort_audit(data, "PRJTEST1"))
    assert before["capabilities"]["scientificReview"]["status"] == "reviewed_for_scope"
    assert before["capabilities"]["independence"]["status"] == "pending"
    assert before["capabilities"]["primaryComparability"]["status"] == "pending"
    (data.root / "identity.json").write_bytes(b"changed")
    assert ledger.project_record(data, "PRJTEST1", None)["capabilities"]["scientificReview"]["status"] == "pending"


def test_supersession_recovers_only_its_purpose_and_retains_history(registered):
    data, path, payload = v2_registry(registered)
    payload["reviews"] = [signed_review(data, "hold", "adjusted", "hold")]
    path.write_text(json.dumps(payload))
    assert analysis.cohort_statistics(data, "PRJTEST1")["audit"]["adjustedStatus"] == "blocked"
    payload["reviews"].append(signed_review(data, "restore", "adjusted", "confirmed", supersedes="hold"))
    path.write_text(json.dumps(payload))
    result = analysis.cohort_statistics(data, "PRJTEST1")
    assert result["audit"]["adjustedStatus"] == "eligible"
    history = ledger.project_record(data, "PRJTEST1", result["audit"])["reviews"]
    assert next(r for r in history if r["reviewId"] == "hold")["validationStatus"] == "superseded"
    assert result["audit"]["capabilities"]["scientificReview"]["status"] == "pending"


@pytest.mark.parametrize("problem", ["conflict", "cycle", "cross_purpose", "unknown_source"])
def test_invalid_review_chains_fail_closed(registered, problem):
    data, path, payload = v2_registry(registered)
    first, second = signed_review(data, "one"), signed_review(data, "two")
    if problem == "cycle":
        first["supersedes"], second["supersedes"] = "two", "one"
    elif problem == "cross_purpose":
        second.update(purpose="adjusted", supersedes="one")
    elif problem == "unknown_source":
        first["evidenceRefs"] = ["absent"]
    payload["reviews"] = [first, second]
    with pytest.raises(ValidationError):
        ResearchRegistry.model_validate(payload)
    path.write_text(json.dumps(payload))
    assert analysis.cohort_statistics(data, "PRJTEST1")["audit"]["unadjustedStatus"] == "blocked"


def test_sample_content_changes_invalidate_review_with_same_run_ids(registered):
    data, path, payload = v2_registry(registered)
    payload["reviews"] = [signed_review(data, purpose="adjusted")]
    path.write_text(json.dumps(payload))
    assert analysis.cohort_audit(data, "PRJTEST1")["adjustedStatus"] == "eligible"
    data.samples[0]["age_years"] += 1
    audit = analysis.cohort_audit(data, "PRJTEST1")
    assert audit["adjustedStatus"] == "blocked" and audit["unadjustedStatus"] == "eligible"


def test_field_opinion_is_bound_to_the_asserted_value_not_just_source_id(registered):
    data, path, payload = v2_registry(registered)
    payload["projects"][0]["facts"] = {"material": {"value": "synthetic stool", "evidenceRefs": ["identity"], "locator": "synthetic fixture", "recordedOn": "2026-10-15"}}
    path.write_text(json.dumps(payload))
    payload["reviews"] = [signed_review(data, purpose="field", scope="field:material")]
    path.write_text(json.dumps(payload))
    assert ledger.project_record(data, "PRJTEST1", None)["fields"]["material"]["status"] == "reviewed_for_scope"
    payload["projects"][0]["facts"]["material"]["value"] = "synthetic saliva"
    path.write_text(json.dumps(payload))
    assert ledger.project_record(data, "PRJTEST1", None)["fields"]["material"]["status"] == "documented_pending_review"
