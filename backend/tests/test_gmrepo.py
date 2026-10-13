import csv
import hashlib
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import gmrepo_service as service


@pytest.fixture
def package(tmp_path, monkeypatch):
    root = tmp_path / "reference-v1"
    (root / "tables").mkdir(parents=True)

    def sample(run, group, profile, decision, resolved, age=None, sex="unknown", code=""):
        return {"project_id": "PRJTEST1", "run_id": run, "research_group": group, "profile_status": profile,
                "analysis_decision": decision, "confirmed_target_genus_percent": resolved,
                "unresolved_at_genus_percent": 100 - resolved if resolved is not None else None,
                "genus_plot_status": "eligible_with_resolution_annotation" if decision == "group_confirmed_ad_nc" and resolved
                else "exclude_no_confirmed_target_genus" if resolved == 0 else "no_complete_profile" if resolved is None else "not_eligible_for_primary_ad_nc",
                "age_years": age, "age_raw": age if age is not None else "90+" if run == "ERR2" else None,
                "age_parse_status": "unparsed_value_preserved" if run == "ERR2" else "numeric" if age else "missing",
                "sex": sex, "author_sex_code_unmapped": code, "group_review_status": "original_author_metadata_exact_sample_alias_join",
                "identity_status": "distinct_source_experiment_alias_shared_registered_biosample", "study_specimen_id": run,
                "biosample_accession": "SAMN1", "gmrepo_candidate_group": "AD" if group == "MCI" else group,
                "bmi": None, "cohort_original_study": "https://example.org/study", "group_evidence_paths": ["evidence/source.tsv"]}

    samples = [sample("ERR1", "AD", "complete_profile", "group_confirmed_ad_nc", 80, 75, "female"),
               sample("ERR2", "NC", "complete_profile", "group_confirmed_ad_nc", 100, code="1"),
               sample("ERR3", "MCI", "complete_profile", "stage_reference", 0),
               sample("ERR4", "AD", "complete_profile", "group_confirmed_ad_nc", 0),
               sample("ERR5", "unresolved", "complete_profile", "pending_group_review", 50),
               sample("ERR6", "unresolved", "source_profile_unavailable", "no_complete_profile", None),
               sample("ERR7", "MCI", "gmrepo_QC_failed_or_not_loaded", "no_complete_profile", None)]
    taxonomy = [{"genus_eligible": True, "current_rank": "genus", "current_domain": "Bacteria",
                 "feature_id": "NCBI:570", "current_name": "Klebsiella", "source_taxon_id": taxid, "source_name": name}
                for taxid, name in [("570", "Klebsiella"), ("160674", "Raoultella")]]
    taxonomy.append({**taxonomy[0], "feature_id": "NCBI:816", "current_name": "Bacteroides", "source_taxon_id": "816", "source_name": "Bacteroides"})
    payloads = {"data_contract.json": {"version": "test-v1", "input_snapshot": "test-raw"},
                "quality_checks.json": {"checks_passed": True, "metadata_runs": 7, "complete_profiles": 5,
                                        "confirmed_current_target_genus_features": 2, "plot_ready_ad_nc_runs": 2, "processed_at_utc": "2026-10-09T00:00:00Z"},
                "validation_readback.json": {"all_checks_passed": True}, "cohort_rules.json": {"PRJTEST1": {"original_study": "https://example.org/study"}},
                "tables/sample_metadata_clean.json": samples, "tables/taxonomy_mapping.json": taxonomy}
    for relative, payload in payloads.items():
        (root / relative).write_text(json.dumps(payload))
    output = io.StringIO()
    writer = csv.writer(output, delimiter="\t")
    writer.writerow(["project_id", "run_id", "feature_id", "relative_abundance_percent"])
    writer.writerows([["PRJTEST1", "ERR1", "NCBI:570", 80], ["PRJTEST1", "ERR2", "NCBI:570", 100], ["PRJTEST1", "ERR5", "NCBI:816", 50]])
    (root / "tables/genus_abundance_long.tsv").write_text(output.getvalue(), encoding="utf-8-sig")
    files = []
    for relative in service.FILES:
        raw = (root / relative).read_bytes()
        files.append({"path": relative, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    (root / "processing_manifest.json").write_text(json.dumps({"files": files}))
    monkeypatch.setattr(service.SETTINGS, "gmrepo_data_root", root)
    service._load_package.cache_clear()
    yield root
    service._load_package.cache_clear()


def test_overview_partitions_and_denominators(package):
    data = service.load_reference_dataset()
    result = service.overview(data, "", "", "all")
    assert result["counts"]["selectedRuns"] == 7
    assert sum(r["count"] for r in result["decisions"]) == 7
    assert [r["count"] for r in result["decisions"]] == [2, 1, 1, 1, 1, 1]
    assert result["counts"]["noResolvedGenusRuns"] == 2  # includes MCI, not added twice to decisions
    assert result["missingness"][0]["denominator"] == 5  # no-profile metadata is excluded
    assert result["missingness"][0]["intervalCount"] == 1
    assert result["missingness"][1]["unmappedCodeCount"] == 1
    assert len(data.samples) == 7  # shared BioSample does not collapse distinct Runs


def test_filtered_quality_and_empty_scope(package):
    data = service.load_reference_dataset()
    result = service.overview(data, "PRJTEST1", "AD", "plot_ready")
    assert result["counts"]["selectedRuns"] == 1
    assert result["counts"]["adRuns"] == 1
    assert result["missingness"][0]["denominator"] == 1
    assert result["missingness"][0]["unavailablePercent"] == 0
    empty = service.overview(data, "", "MCI", "plot_ready")
    assert empty["counts"]["selectedRuns"] == 0
    assert empty["missingness"][0]["unavailablePercent"] is None
    assert empty["resolution"] == []


def test_genus_choice_keeps_zero_and_preserves_unavailable_values(package):
    data = service.load_reference_dataset()
    result = service.sample_page(data, "", "", "all", "NCBI:816", 25, 0)
    assert result["total"] == 7
    values = {s["runId"]: s["genusAbundancePercent"] for s in result["items"]}
    assert values["ERR1"] == 0  # source-unlisted within a resolved, complete profile
    assert values["ERR5"] == 50
    assert values["ERR3"] is None  # complete but entirely unresolved
    assert values["ERR4"] is None
    assert values["ERR6"] is None  # absent source profile is never a zero
    assert service.genus_page(data, "Raoultella")["items"][0]["featureId"] == "NCBI:570"
    assert service.sample_page(data, "", "", "all", "", 2, 2)["items"][0]["runId"] == "ERR4"


def test_api_validation_and_revision_consistency(package):
    client = TestClient(app)
    catalog = client.get("/api/references/gmrepo/catalog")
    assert catalog.status_code == 200
    revision = catalog.json()["provenance"]["fingerprint"]
    assert client.get("/api/references/gmrepo/overview", params={"revision": revision, "scope": "plot_ready"}).json()["counts"]["plotReadyRuns"] == 2
    assert client.get("/api/references/gmrepo/overview?revision=obsolete").status_code == 409
    for query in ["group=bogus", "cohort=../outside", "scope=invalid"]:
        assert client.get("/api/references/gmrepo/overview?" + query).status_code == 422
    for query in ["genus=NCBI:999999", "genus=../file", "limit=101", "offset=-1"]:
        assert client.get("/api/references/gmrepo/samples?" + query).status_code == 422
    assert client.get("/api/references/gmrepo/overview?cohort=PRJMISSING").status_code == 422


def test_corrupt_or_absent_package_fails_closed(package, monkeypatch):
    (package / "tables/sample_metadata_clean.json").write_text("[]")
    response = TestClient(app).get("/api/references/gmrepo/catalog")
    assert response.status_code == 503
    assert response.json()["code"] == "gmrepo_integrity_error"
    monkeypatch.setattr(service.SETTINGS, "gmrepo_data_root", package / "missing")
    response = TestClient(app).get("/api/references/gmrepo/catalog")
    assert response.status_code == 503
    assert str(package) not in response.text
