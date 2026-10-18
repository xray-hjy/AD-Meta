import json
import sqlite3
from types import SimpleNamespace

import test_gmrepo_analysis as cohort_fixtures
import test_gmrepo_primary_evidence as primary_fixtures
from fastapi.testclient import TestClient

from app.main import app
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_evaluation_service as evaluation
from app.services import gmrepo_service as reference

evidence_cohort = cohort_fixtures.cohort
source_db = primary_fixtures.primary_db


def test_aggregate_keeps_one_record_per_cohort_and_unadjusted_adjusted_separate(evidence_cohort, monkeypatch):
    data, _ = evidence_cohort
    monkeypatch.setattr(evaluation.primary, "primary_evidence", lambda *_args: {"status": "unavailable", "reasons": ["主数据待接入"]})
    record = evaluation.evidence_summary(data, "NCBI:816")
    assert record["familySize"] == 3
    assert len(record["cohorts"]) == 1
    assert record["summary"]["testableCohorts"] == 1
    assert record["summary"]["replicationStatus"] == "not_established"
    assert record["cohorts"][0]["sourceMarkers"][0]["pureAdNc"] is False
    assert record["cohorts"][0]["statistic"]["signalStatus"] == "direction_conflict"
    report = evaluation.markdown_report(record)
    assert "test-fingerprint" in report and "主数据待接入" in report
    assert "临床" in report


def test_cached_full_family_is_not_mutated_by_pagination_and_rechecks_identity(evidence_cohort, monkeypatch):
    data, review = evidence_cohort
    analysis._STATISTICS_CACHE.clear()
    original = analysis._compute_cohort_statistics
    calls = []

    def counted(*args):
        calls.append(1)
        return original(*args)

    monkeypatch.setattr(analysis, "_compute_cohort_statistics", counted)
    first = analysis.statistics_page(data, "PRJTEST1", query="Klebsiella", limit=1)
    second = analysis.cohort_statistics(data, "PRJTEST1")
    assert len(first["items"]) == 1
    assert len(second["items"]) == 3
    assert len(calls) == 1
    payload = json.loads(review.read_text())
    payload["referenceFingerprint"] = "revoked"
    review.write_text(json.dumps(payload))
    third = analysis.cohort_statistics(data, "PRJTEST1")
    assert third["items"] == []
    assert third["audit"]["unadjustedStatus"] == "blocked"
    assert len(calls) == 2


def test_species_mapping_requires_fixed_revision_and_domain(evidence_cohort, source_db, monkeypatch):
    data, _ = evidence_cohort
    with sqlite3.connect(source_db) as conn:
        conn.executescript("""
            ALTER TABLE datasets ADD COLUMN id INTEGER;
            UPDATE datasets SET id = 1;
            ALTER TABLE dataset_revisions ADD COLUMN dataset_id INTEGER;
            UPDATE dataset_revisions SET dataset_id = 1;
        """)
    mapped = evaluation.resolve_subject(data, "species", "1", "current-version")
    assert mapped["status"] == "mapped"
    assert mapped["genus"]["featureId"] == "NCBI:570"
    assert mapped["mappingLevel"] == "genus_background"
    assert mapped["sourceRevision"] == "current-version"
    wrong = evaluation.resolve_subject(data, "species", "4", "current-version")
    assert wrong["status"] == "no_reference_match"  # same genus name, wrong domain
    missing = evaluation.resolve_subject(data, "species", "3", "current-version")
    assert missing["status"] == "source_unavailable"  # this object is old-version only
    assert evaluation.resolve_subject(data, "species", "1", "")["status"] == "source_version_required"
    assert evaluation.resolve_subject(data, "species", "1", "obsolete")["status"] == "source_unavailable"
    from app.services import full_result_service

    monkeypatch.setattr(full_result_service, "query_complete_results", lambda *_args, **_kwargs: {
        "featureKind": "species", "datasetRevision": "current-version", "datasetSlug": "ad-nc-species", "items": [{"featureId": "1"}],
    })
    contextual = evaluation.resolve_subject(data, "species", "1", "current-version", run_key="run", artifact_key="artifact")
    assert contextual["status"] == "mapped"
    mismatch = evaluation.resolve_subject(data, "species", "1", "obsolete", run_key="run", artifact_key="artifact")
    assert mismatch["status"] == "context_mismatch"


def test_mag_missing_rank_path_does_not_guess_from_gtdb_name(evidence_cohort, monkeypatch):
    from app.services import mag_data_service as mag

    data, _ = evidence_cohort
    source = SimpleNamespace(fingerprint="mag-fixed", mag_ids=("MAG1",), lineage=(), crosswalk=({
        "magId": "MAG1", "mappingStatus": "matched_exact_ncbi_species_taxid",
        "ncbiTaxonomy": "Bacteria;something;Klebsiella", "gtdbSpecies": "s__Klebsiella_A unknown",
    },))
    monkeypatch.setattr(mag, "load_mag_dataset", lambda: source)
    result = evaluation.resolve_subject(data, "mag", "MAG1", "mag-fixed")
    assert result["status"] == "unresolved"
    assert result["genus"] is None
    assert evaluation.resolve_subject(data, "mag", "MAG1", "different")["status"] == "source_version_mismatch"
    source.crosswalk = ({"magId": "MAG1", "mappingStatus": "matched_exact_ncbi_species_taxid",
                         "ncbiTaxonomy": "k__Bacteria;g__Klebsiella;s__Klebsiella_pneumoniae"},)
    mapped = evaluation.resolve_subject(data, "mag", "MAG1", "mag-fixed")
    assert mapped["status"] == "mapped"
    assert mapped["representativeMag"] == "MAG1"


def test_new_api_gates_versions_and_rejects_incorrect_report_subject(evidence_cohort, monkeypatch):
    data, _ = evidence_cohort
    monkeypatch.setattr(evaluation.primary, "primary_evidence", lambda *_args: {"status": "unavailable", "reasons": []})
    client = TestClient(app)
    assert client.get("/api/references/gmrepo/evidence-summary", params={"genus": "NCBI:816", "revision": "obsolete"}).status_code == 409
    assert client.get("/api/references/gmrepo/evidence-summary", params={"genus": "NCBI:unknown"}).status_code == 422
    record = client.get("/api/references/gmrepo/evidence-summary", params={"genus": "NCBI:816", "revision": data.fingerprint})
    assert record.status_code == 200
    assert record.json()["summary"]["testableCohorts"] == 1
    wrong = client.get("/api/references/gmrepo/report", params={"genus": "NCBI:570", "subjectType": "genus", "subjectId": "NCBI:816"})
    assert wrong.status_code == 422
    report = client.get("/api/references/gmrepo/report", params={"genus": "NCBI:816", "revision": data.fingerprint})
    assert report.status_code == 200
    assert "text/markdown" in report.headers["content-type"]


def test_unknown_reference_genus_never_falls_back(evidence_cohort):
    data, _ = evidence_cohort
    result = evaluation.resolve_subject(data, "genus", "NCBI:404", "")
    assert result["status"] == "no_reference_match"
    assert result["genus"] is None
    assert reference.provenance(data)["fingerprint"] == "test-fingerprint"
