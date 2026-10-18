import hashlib
import io
import json
import zipfile

import pytest
import test_gmrepo_ledger as fixtures
from pydantic import ValidationError

from app.cli.import_gmrepo_reviews import validate
from app.services import external_wgs_service as wgs
from app.services import gmrepo_relationship_service as relationships
from app.services import gmrepo_review_service as review
from app.services.gmrepo_ledger_models import ResearchRegistry

cohort = fixtures.cohort
registered = fixtures.registered


@pytest.fixture
def author_data(tmp_path, monkeypatch):
    root = tmp_path / "wgs"
    root.mkdir()
    authors = tmp_path / "authors"
    authors.mkdir()
    source = b"Synthetic fixture only"
    (authors / "author.RData").write_bytes(source)
    source_record = tmp_path / "zenodo.json"
    source_record.write_text(json.dumps({"metadata": {"license": {"id": "synthetic-test"}}, "files": [{"key": "author.RData", "size": len(source), "checksum": "md5:" + hashlib.md5(source).hexdigest()}]}))
    data = {"sourceProvider": "original_study", "clinicalComparison": "preclinical_AD_vs_biomarker_negative_CN", "inferenceStatus": "descriptive_only",
            "projectId": "PRJNA798058", "platform": "WGS", "processingVersion": "test-MPA3", "title": "Synthetic example", "studyUrl": "https://example.test/paper",
            "sourceUrl": "https://example.test/data", "unit": "relative_abundance_percent", "scientificReviewStatus": "pending", "limits": ["Not clinical AD/NC"],
            "samples": [{"participantId": "p1", "group": "preclinical_AD"}, {"participantId": "p2", "group": "biomarker_negative_CN"}],
            "features": [{"featureId": "MPA3:" + "1" * 20, "name": "Bacteroides", "level": "genus", "clade": "k__Bacteria|g__Bacteroides", "sourceTaxonPath": "2|816", "values": {"p1": 3., "p2": 0.}}],
            "sourceReceipts": [{"file": "author.RData", "sha256": hashlib.sha256(source).hexdigest(), "bytes": len(source)}], "excludedProfileOnlyIds": ["excluded"], "extraction": {}}
    raw = json.dumps(data).encode()
    (root / "reference.json").write_bytes(raw)
    (root / "manifest.json").write_text(json.dumps({"files": [{"path": "reference.json", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}]}))
    monkeypatch.setattr(wgs, "ROOT", root)
    monkeypatch.setattr(wgs, "AUTHOR_FILES", authors)
    monkeypatch.setattr(wgs, "AUTHOR_RECORD", source_record)
    return root, authors


def test_wgs_keeps_stage_source_and_zero_and_rechecks_originals(author_data):
    _, authors = author_data
    result = wgs.catalog("Bacteroides")
    assert result["sourceProvider"] == "original_study" and result["groupCounts"] == {"preclinical_AD": 1, "biomarker_negative_CN": 1}
    result = wgs.distribution(result["items"][0]["featureId"], result["fingerprint"])
    assert result["statistic"] is None and result["groups"][1]["median"] == 0
    with pytest.raises(ValueError, match="版本已变化"):
        wgs.distribution(result["feature"]["featureId"], "0" * 64)
    (authors / "author.RData").write_bytes(b"changed after cache hit")
    assert wgs.object_background("Bacteroides")["status"] == "unavailable"


def test_no_exact_wgs_genus_never_substitutes_default(author_data):
    result = wgs.object_background("Not a known genus")
    assert result["status"] == "no_exact_source_genus_match" and result["distribution"] is None


def test_bilateral_scope_unknown_participant_ids_are_not_independence(registered, tmp_path, monkeypatch):
    data, _, _ = registered
    primary = tmp_path / "primary.tsv"
    primary.write_text("run_accession\tbiosample_accession\thost_subject_id_raw\nCRR1\tSAMC1\t\n")
    (tmp_path / "metadata").mkdir()
    (tmp_path / "metadata/verified_cohorts.json").write_text(json.dumps({"cohorts": [{"sampleCount": 1, "sampleSetSha256": hashlib.sha256(b"CRR1").hexdigest()}]}))
    monkeypatch.setattr(relationships, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr(relationships, "PRIMARY", primary)
    result = relationships.assess(data, ["PRJTEST1"])
    assert result["primaryStatus"] == "registered_scope_matched"
    row = next(r for r in result["pairs"] if r["leftNode"] == "PRJTEST1" and r["rightNode"] == "primary:CRA014435")
    assert row["runIntersection"] == [] and row["outcome"] == "inconclusive"
    assert row["participantCoverage"]["primary:CRA014435"]["known"] == 0
    assert result["independentReplicationCount"] is None
    old = row["rightFingerprint"]
    primary.write_text(primary.read_text().replace("SAMC1", "SAMC2"))
    changed = relationships.assess(data, ["PRJTEST1"])
    assert next(r for r in changed["pairs"] if r["leftNode"] == "PRJTEST1" and r["rightNode"] == "primary:CRA014435")["rightFingerprint"] != old


def test_review_dossier_is_concrete_but_empty_submission_cannot_publish(registered):
    data, path, _ = registered
    before = path.read_bytes()
    workspace = review.workspace(data)
    with zipfile.ZipFile(io.BytesIO(review.dossier(data))) as archive:
        template = json.loads(archive.read("review-candidate.json"))
        scopes = json.loads(archive.read("scope-templates.json"))
    assert workspace["questions"] and workspace["signaturesGenerated"] == 0
    assert scopes["projectReviewScopes"] and all(r["decision"] == "pending" for r in scopes["projectReviewScopes"])
    with pytest.raises(ValueError, match="没有实际意见"):
        validate(template, data)
    assert path.read_bytes() == before


def test_signed_submission_dry_run_does_not_mutate_registry(registered):
    data, path, payload = fixtures.v2_registry(registered)
    path.write_text(json.dumps(payload))
    before = path.read_bytes()
    workspace = review.workspace(data)
    submission = {"referenceFingerprint": data.fingerprint, "baseRegistrySha256": hashlib.sha256(before).hexdigest(), "dossierFingerprint": workspace["fingerprint"],
                  "reviews": [fixtures.signed_review(data)], "relationshipReviews": []}
    proposed, result = validate(submission, data)
    assert len(proposed["reviews"]) == 1 and result["status"] == "technical_validation_only"
    assert path.read_bytes() == before
    submission["reviews"][0]["comparisonFingerprint"] = "0" * 64
    with pytest.raises(ValueError, match="范围/方法不匹配"):
        validate(submission, data)


@pytest.mark.parametrize("fault", ["unsigned", "cross_scope", "cycle", "level_order_conflict"])
def test_relationship_reviews_reject_invalid_chains(registered, fault):
    data, _, payload = fixtures.v2_registry(registered)
    first = {"reviewId": "synthetic-one", "relationshipId": "relation:test", "leftNode": "PRJTEST1", "rightNode": "primary:CRA014435",
             "leftFingerprint": "1" * 64, "rightFingerprint": "2" * 64, "decision": "confirmed", "outcome": "inconclusive", "examinedLevels": ["run", "participant"],
             "evidenceRefs": ["identity"], "note": "Synthetic fixture, not production opinion", "reviewer": "Synthetic reviewer", "role": "test", "reviewedOn": "2026-10-16"}
    second = {**first, "reviewId": "synthetic-two", "supersedes": first["reviewId"]}
    if fault == "unsigned":
        first["reviewer"] = None
    elif fault == "cross_scope":
        second["rightFingerprint"] = "3" * 64
    elif fault == "cycle":
        first["supersedes"] = second["reviewId"]
    elif fault == "level_order_conflict":
        second.pop("supersedes")
        second["examinedLevels"] = ["participant", "run"]
    payload["relationshipReviews"] = [first, second]
    with pytest.raises(ValidationError):
        ResearchRegistry.model_validate(payload)
