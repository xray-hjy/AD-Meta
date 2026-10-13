import csv
import hashlib
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import mannwhitneyu, rankdata
from statsmodels.regression.linear_model import OLS

from app.compute.statistics import benjamini_hochberg
from app.main import app
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_primary_evidence as primary
from app.services import gmrepo_service as reference


@pytest.fixture
def cohort(tmp_path, monkeypatch):
    rng = np.random.default_rng(214)
    samples, abundances = [], {}
    for i in range(80):
        group = "AD" if i < 40 else "NC"
        age = 60 + 10 * (group == "AD") + rng.uniform(0, 20)
        value = age - 5 * (group == "AD") + rng.normal(0, .2)
        run = f"ERR{i:03}"
        samples.append({"project_id": "PRJTEST1", "run_id": run, "participant_id": f"person-{i}",
                        "identity_status": "explicit_study_scoped_participant_id", "study_specimen_id": f"stool-{i}",
                        "research_group": group, "profile_status": "complete_profile", "analysis_decision": "group_confirmed_ad_nc",
                        "genus_plot_status": "eligible_with_resolution_annotation", "confirmed_target_genus_percent": value + 5,
                        "unresolved_at_genus_percent": 95 - value, "sex": "female" if i % 2 else "male",
                        "age_years": age, "age_raw": str(age), "source_QCStatus": 1, "source_read_count": 10000,
                        "author_sex_code_unmapped": "1" if i % 2 else "2", "group_evidence_paths": ["identity.json"]})
        abundances[("PRJTEST1", run)] = {"NCBI:816": value, "NCBI:570": 5.0}
    genera = {f"NCBI:{taxid}": {"featureId": f"NCBI:{taxid}", "name": name, "domain": "Bacteria",
                              "sourceTaxonIds": [taxid], "sourceNames": [name]}
              for taxid, name in [("816", "Bacteroides"), ("570", "Klebsiella"), ("999", "ZeroGenus")]}
    source = json.dumps([s["participant_id"] for s in samples]).encode()
    (tmp_path / "identity.json").write_bytes(source)
    (tmp_path / "tables").mkdir()
    with (tmp_path / "tables/source_marker_evidence.tsv").open("w") as stream:
        writer = csv.DictWriter(stream, fieldnames=["project_id", "source_taxon_id", "source_name", "feature_id", "source_lda", "enriched_source_group", "comparison_status", "source_response"], delimiter="\t")
        writer.writeheader()
        writer.writerow({"project_id": "PRJTEST1", "source_taxon_id": "816", "source_name": "Bacteroides", "feature_id": "NCBI:816",
                         "source_lda": "3.2", "enriched_source_group": "AD", "comparison_status": "mixed_stages", "source_response": "raw/marker.response"})
    files = []
    for name in ("identity.json", "tables/source_marker_evidence.tsv"):
        content = (tmp_path / name).read_bytes()
        files.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    (tmp_path / "processing_manifest.json").write_text(json.dumps({"files": files}))
    registry = {"version": "test-audit", "referenceFingerprint": "test-fingerprint", "cohorts": {"PRJTEST1": {
        "allRunSetSha256": hashlib.sha256("\n".join(sorted(s["run_id"] for s in samples)).encode()).hexdigest(),
        "identityReviewed": True, "sexMode": "decoded", "evidence": ["identity.json"], "note": "Synthetic reviewed one-person-one-stool cohort."}}}
    path = tmp_path / "review.json"
    path.write_text(json.dumps(registry))
    monkeypatch.setattr(analysis, "REVIEW_PATH", path)
    data = reference.ReferenceDataset("test-fingerprint", {"version": "test-v1", "input_snapshot": "test-raw"},
                                      {"processed_at_utc": "2026-10-12", "complete_profiles": 80}, {}, tuple(samples), genera, abundances, tmp_path)
    monkeypatch.setattr(reference, "load_reference_dataset", lambda: data)
    return data, path


def test_age_confounding_is_visible_and_adjustment_can_reverse_direction(cohort):
    data, _ = cohort
    result = analysis.cohort_statistics(data, "PRJTEST1")
    row = next(r for r in result["items"] if r["genus"]["featureId"] == "NCBI:816")
    assert result["audit"]["unadjustedStatus"] == "eligible"
    assert row["rankBiserial"] > 0  # older AD group gives the unadjusted apparent direction
    assert row["adjusted"]["effect"] < 0
    assert row["adjusted"]["ciHigh"] < 0
    assert row["signalStatus"] == "direction_conflict"
    # Independent mathematical HC3 sandwich calculation verifies effect, interval and p-value.
    samples = sorted(data.samples, key=lambda s: s["run_id"])
    design = np.column_stack([np.ones(80), [s["research_group"] == "AD" for s in samples],
                              (np.array([s["age_years"] for s in samples]) - np.mean([s["age_years"] for s in samples])) / 10,
                              [s["sex"] == "male" for s in samples]])
    values = [data.abundance[("PRJTEST1", s["run_id"])]["NCBI:816"] for s in samples]
    response = (rankdata(values) - .5) / 80 * 100
    inverse = np.linalg.inv(design.T @ design)
    beta = inverse @ design.T @ response
    residuals = response - design @ beta
    leverage = np.sum((design @ inverse) * design, axis=1)
    covariance = inverse @ design.T @ np.diag((residuals / (1 - leverage)) ** 2) @ design @ inverse
    model = OLS(response, design).fit(cov_type="HC3", use_t=True)
    assert row["adjusted"]["effect"] == pytest.approx(beta[1])
    assert model.bse[1] == pytest.approx(np.sqrt(covariance[1, 1]))
    assert row["adjusted"]["ciLow"] == pytest.approx(model.conf_int()[1, 0])
    assert row["adjusted"]["pValue"] == pytest.approx(model.pvalues[1])


@pytest.mark.parametrize("problem", ["repeated_participant", "missing_participant", "review_changed", "evidence_corrupt"])
def test_independence_gate_blocks_p_values_but_keeps_distribution(cohort, problem):
    data, review = cohort
    if problem == "repeated_participant":
        data.samples[1]["participant_id"] = data.samples[0]["participant_id"]
    elif problem == "missing_participant":
        data.samples[0]["participant_id"] = None
    elif problem == "review_changed":
        payload = json.loads(review.read_text())
        payload["referenceFingerprint"] = "different"
        review.write_text(json.dumps(payload))
    else:
        (data.root / "identity.json").write_text("changed")
    result = analysis.cohort_statistics(data, "PRJTEST1")
    assert result["audit"]["unadjustedStatus"] == "blocked"
    assert result["items"] == []
    assert result["total"] == 0
    distribution = analysis.distribution(data, "PRJTEST1", "NCBI:999")
    assert len(distribution["points"]) == 80
    assert all(p["value"] == 0 for p in distribution["points"])


def test_complete_case_age_intervals_and_original_sex_categories(cohort):
    data, review = cohort
    for i in (0, 40):
        data.samples[i]["age_years"] = None
        data.samples[i]["age_raw"] = "90+"
    payload = json.loads(review.read_text())
    payload["cohorts"]["PRJTEST1"].update(sexMode="author_code", allowedSexCodes=["1", "2"])
    review.write_text(json.dumps(payload))
    for sample in data.samples:
        sample["sex"] = "unknown"
    result = analysis.cohort_statistics(data, "PRJTEST1")
    audit = result["audit"]
    assert audit["adjustedCount"] == 78
    assert audit["excludedMissingCovariates"] == 2
    assert audit["covariates"][0]["ageIntervalCount"] == 1
    assert audit["covariates"][0]["sexKnown"] == 40
    assert "sex_category_2_vs_1" in audit["design"]["columns"]
    assert len(analysis.distribution(data, "PRJTEST1", "NCBI:816")["points"]) == 80


def test_singular_design_does_not_produce_adjusted_significance(cohort):
    data, _ = cohort
    for sample in data.samples:
        sample["sex"] = "male" if sample["research_group"] == "AD" else "female"
    result = analysis.cohort_statistics(data, "PRJTEST1")
    assert result["audit"]["unadjustedStatus"] == "eligible"
    assert result["audit"]["adjustedStatus"] == "blocked"
    assert all(row["adjusted"] is None for row in result["items"])


def test_zero_values_global_fdr_and_search_do_not_change_the_test_family(cohort):
    data, _ = cohort
    result = analysis.cohort_statistics(data, "PRJTEST1")
    expected = benjamini_hochberg([r["pValue"] for r in result["items"]])
    assert [r["qValue"] for r in result["items"]] == pytest.approx(expected)
    genus = analysis.statistics_page(data, "PRJTEST1", "Bacteroides", 1, 0)
    assert genus["total"] == 1 and genus["familySize"] == 3
    assert genus["items"][0]["qValue"] == result["items"][0]["qValue"]
    zero = next(r for r in result["items"] if r["genus"]["featureId"] == "NCBI:999")
    assert zero["pValue"] == zero["qValue"] == 1
    assert zero["rankBiserial"] == 0 and zero["adjusted"]["status"] == "constant"
    assert zero["adjusted"]["ciLow"] is None


def test_box_and_scatter_source_percentages_are_exact_and_reproducible(cohort):
    data, _ = cohort
    a = analysis.distribution(data, "PRJTEST1", "NCBI:816")
    b = analysis.distribution(data, "PRJTEST1", "NCBI:816")
    assert a == b
    assert {p["runId"] for p in a["points"]} == {s["run_id"] for s in data.samples}
    for point in a["points"]:
        assert point["value"] == data.abundance[("PRJTEST1", point["runId"])]["NCBI:816"]
        assert abs(point["jitter"]) <= .16
    values = [p["value"] for p in a["points"] if p["group"] == "AD"]
    assert a["boxes"][0]["box"][1:4] == pytest.approx(np.percentile(values, [25, 50, 75]))
    assert analysis.rank_effect_interval(data, "PRJTEST1", "NCBI:816") == analysis.rank_effect_interval(data, "PRJTEST1", "NCBI:816")
    ad = np.asarray(values)
    nc = np.asarray([p["value"] for p in a["points"] if p["group"] == "NC"])
    expected_p = mannwhitneyu(ad, nc, alternative="two-sided", method="asymptotic", use_continuity=True).pvalue
    row = next(r for r in analysis.cohort_statistics(data, "PRJTEST1")["items"] if r["genus"]["featureId"] == "NCBI:816")
    assert row["pValue"] == pytest.approx(expected_p)


def test_evidence_preserves_mixed_stage_marker_and_primary_unavailability(cohort, monkeypatch):
    data, _ = cohort
    monkeypatch.setattr(primary, "primary_evidence", lambda _: {"status": "unavailable", "quantitativeStatus": "blocked"})
    result = analysis.evidence(data, "PRJTEST1", "NCBI:816")
    assert result["sourceMarkers"][0]["pureAdNc"] is False
    assert result["sourceMarkers"][0]["pValue"] is None
    assert result["sourceMarkers"][0]["qValue"] is None
    assert result["primary"]["quantitativeStatus"] == "blocked"
    assert analysis.source_markers(data, "PRJTEST1", "NCBI:999") == []
    (data.root / "tables/source_marker_evidence.tsv").write_text("corrupt")
    with pytest.raises(reference.GmrepoDataError):
        analysis.source_markers(data, "PRJTEST1", "NCBI:816")


def test_api_requires_single_cohort_and_fixed_genus(cohort):
    client = TestClient(app)
    for path in ("distribution", "statistics", "evidence"):
        assert client.get(f"/api/references/gmrepo/{path}").status_code == 422
    assert client.get("/api/references/gmrepo/distribution", params={"cohort": "PRJTEST1", "genus": "NCBI:816", "revision": "obsolete"}).status_code == 409
    response = client.get("/api/references/gmrepo/distribution", params={"cohort": "PRJTEST1", "genus": "NCBI:816", "group": "NC", "scope": "pending"})
    assert response.status_code == 200
    assert len(response.json()["points"]) == 80  # overview scope cannot silently change the comparison
    assert client.get("/api/references/gmrepo/statistics?cohort=PRJTEST1&query=Bacteroides&limit=1").json()["familySize"] == 3
