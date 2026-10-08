import csv
import hashlib
import io
import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.cluster.hierarchy import leaves_list
from scipy.stats import mannwhitneyu

from app.api import mag
from app.cli import prepare_mag_v2
from app.compute.statistics import benjamini_hochberg
from app.main import app
from app.services import mag_data_service as service


@pytest.fixture
def package(tmp_path):
    root = tmp_path / "development_input" / "mag_v1"
    (root / "abundance").mkdir(parents=True)
    (root / "metadata").mkdir()
    content = {
        service.MATRIX: "Sample\tMAG_A\tMAG_B\tMAG_C\nCRR1\t1\t0\t9\nCRR2\t3\t0\t17\nCRR3\t6\t0\t24\nCRR4\t10\t0\t30\n",
        service.MANIFEST: "Sample\tR1\tR2\tCoverMLabel\n" + "".join(f"CRR{i}\t/private/r1\t/private/r2\tlabel\n" for i in range(1, 5)),
        service.LENGTHS: "MAG\tlength_bp\nMAG_C\t3000\nMAG_B\t2000\nMAG_A\t1000\n",
        service.MAPPING: "Sample\tUnmapped_relative_abundance_percent\tMapped_to_872_MAGs_percent\n" + "".join(f"CRR{i}\t{100-i*10}\t{i*10}\n" for i in range(1, 5)),
        # Opposite row order and deliberately misleading Group to prove ID joins/disease usage.
        service.METADATA: "sample_id,Sample_name,Accession,disease,HPC_Batch,Group,Age,Gender\nCRR4,s4,a4,AD,2,NC,80,M\nCRR3,s3,a3,AD,1,NC,70,F\nCRR2,s2,a2,NC,2,AD,65,M\nCRR1,s1,a1,NC,1,AD,60,F\n",
    }
    for name, text in content.items():
        (root / name).write_text(text, encoding="utf-8")
    source = tmp_path / "source_data" / "data"
    source.mkdir(parents=True)
    taxonomy_header = "user_genome\tclassification\tclosest_genome_reference\tclosest_genome_ani\tclosest_genome_af\tclassification_method\tmsa_percent\n"
    (source / "AD_dRep.bac120.summary.tsv").write_text(
        taxonomy_header
        + "MAG_A\td__Bacteria;p__P1;c__C1;o__O1;f__F1;g__G1;s__S1\tGCA_1\t99\t0.9\tANI and topology\t95\n"
        + "MAG_B\td__Bacteria;p__P1;c__C1;o__O1;f__F2;g__G2;s__\tN/A\tN/A\tN/A\ttopology\t90\n"
        + "MAG_C\td__Bacteria;p__P2;c__C2;o__O2;f__F3;g__G3;s__S3\tGCA_3\t97\t0.8\tANI and topology\t93\n",
        encoding="utf-8",
    )
    (source / "AD_dRep.ar53.summary.tsv").write_text(taxonomy_header, encoding="utf-8")
    (source / "quality_report.tsv").write_text(
        "Name\tCompleteness\tContamination\tCompleteness_Model_Used\tCoding_Density\tContig_N50\tGenome_Size\tGC_Content\tTotal_Coding_Sequences\tTotal_Contigs\tMax_Contig_Length\n"
        + "MAG_A\t95\t2\tNeural Network\t0.9\t500\t1000\t0.5\t100\t10\t700\n"
        + "MAG_B\t80\t6\tGradient Boost\t0.8\t700\t2000\t0.4\t200\t20\t900\n"
        + "MAG_C\t92\t4\tNeural Network\t0.85\t900\t3000\t0.45\t300\t30\t1200\n",
        encoding="utf-8",
    )
    return tmp_path


def load(package):
    return service.load_mag_dataset(package, service.MagContract(4, 3, 2, 2), version="mag_v1")


def load_v2(package):
    return load_fixture_original(package, service.MagContract(4, 3, 2, 2), version="mag_v2")


def test_join_units_stats_and_bh_before_search(package):
    data = load(package)
    assert [s["disease"] for s in data.samples] == ["NC", "NC", "AD", "AD"]
    assert data.lengths == (1000, 2000, 3000)
    assert not data.matrix.flags.writeable
    assert data.matrix.sum(axis=1).tolist() == [10, 20, 30, 40]  # no closure to 100
    rows = service.comparison_rows(data, service.MagScope())
    p = mannwhitneyu(data.matrix[2:], data.matrix[:2], axis=0, alternative="two-sided", method="asymptotic").pvalue
    np.testing.assert_allclose([r["qValue"] for r in rows], benjamini_hochberg(p))
    assert rows[0]["meanDifferencePercentPoints"] == 6
    assert rows[0]["rankBiserial"] == 1
    assert rows[1]["pValue"] == 1
    assert rows[1]["rankBiserial"] == 0
    page = service.feature_page(data, service.MagScope(), query="MAG_A", limit=1)
    assert page["total"] == 1
    assert page["items"][0]["qValue"] == rows[0]["qValue"]
    assert page["provenance"]["testedFeatureCount"] == 3


def test_threshold_changes_only_above_threshold_summary_and_filtered_statistics(package):
    data = load(package)
    baseline = service.comparison_rows(data, service.MagScope())
    rows = service.comparison_rows(data, service.MagScope(abundance_threshold_percent=6))
    assert rows[0]["adAboveThresholdPercent"] == 50  # strict > threshold
    assert rows[0]["ncAboveThresholdPercent"] == 0
    assert rows[0]["qValue"] == baseline[0]["qValue"]
    for scope in (service.MagScope(gender="F"), service.MagScope(disease="AD"), service.MagScope(age_min=90)):
        result = service.feature_page(data, scope)
        assert result["provenance"]["testedFeatureCount"] == 0
        assert all(r["pValue"] is None and r["qValue"] is None for r in result["items"])
    filtered = service.sample_rows(data, service.MagScope(batch="1", age_min=65))
    assert [s["sampleId"] for s in filtered] == ["CRR3"]


@pytest.mark.parametrize("name,old,new,expected", [
    (service.MATRIX, "Sample", "sample", "首列"),
    (service.MATRIX, "MAG_B", "MAG_A", "重复表头"),
    (service.MATRIX, "CRR2", "CRR1", "主键"),
    (service.MATRIX, "\t1\t0\t9", "\t-1\t0\t11", "越界"),
    (service.MATRIX, "\t1\t0\t9", "\tNaN\t0\t9", "NaN"),
    (service.MATRIX, "\t1\t0\t9", "\t0.01\t0\t0.09", "偏差"),
    (service.METADATA, "CRR4", "CRR99", "ID 集合"),
    (service.METADATA, ",AD,", ",MCI,", "disease"),
    (service.METADATA, ",80,M", ",,M", "数值"),
    (service.LENGTHS, "MAG_C", "MAG_X", "MAG 集合"),
    (service.LENGTHS, "3000", "3.5", "正整数"),
    (service.MAPPING, "90\t10", "90\t11", "比例和"),
])
def test_invalid_input_fails_closed_including_after_cached_load(package, name, old, new, expected):
    load(package)
    path = package / "development_input" / "mag_v1" / name
    path.write_text(path.read_text().replace(old, new), encoding="utf-8")
    with pytest.raises(service.MagDataError, match=expected):
        load(package)


def test_missing_file_counts(package):
    with pytest.raises(service.MagDataError, match="872"):
        service.load_mag_dataset(package, version="mag_v1")
    path = package / "development_input" / "mag_v1" / service.LENGTHS
    path.unlink()
    with pytest.raises(service.MagDataError, match="存在且可读"):
        load(package)


def test_path_escape(package):
    path = package / "development_input" / "mag_v1" / service.LENGTHS
    path.unlink()
    try:
        path.symlink_to(Path(__file__))
    except OSError as exc:
        if getattr(exc, "winerror", None) == 1314:
            pytest.skip("Windows requires Developer Mode or symlink privileges for this check.")
        raise
    with pytest.raises(service.MagDataError, match="路径越界"):
        load(package)


@pytest.fixture
def client(package, monkeypatch):
    monkeypatch.setattr(mag.service, "load_mag_dataset", lambda: load_fixture(package))
    return TestClient(app)


# Preserve the actual loader before dependency patching.
load_fixture_original = service.load_mag_dataset


def load_fixture(package):
    return load_fixture_original(package, service.MagContract(4, 3, 2, 2), version="mag_v1")


@pytest.fixture
def client_v2(package, monkeypatch):
    prepare_mag_v2.build(package, "mag_v1", "mag_v2", service.MagContract(4, 3, 2, 2))
    monkeypatch.setattr(mag.service, "load_mag_dataset", lambda: load_v2(package))
    return TestClient(app)


@pytest.fixture
def package_v3(package):
    prepare_mag_v2.build(package, "mag_v1", "mag_v2", service.MagContract(4, 3, 2, 2))
    source = package / "development_input" / "mag_v2"
    root = package / "development_input" / "mag_v3"
    shutil.copytree(source, root)
    (root / service.V2_MANIFEST).unlink()

    lineage_rows = []
    lineage_specs = [
        ("c1", "MAG_A", "MAG_A", "CRR1", "NC", "CHN", 1.0, True, 2),
        ("c1", "MAG_A", "MEMBER_X", "CRR2", "NC", "CHN2", 0.949, False, 2),
        ("c2", "MAG_B", "MAG_B", "CRR3", "AD", "CHN", 1.0, True, 1),
        ("c3", "MAG_C", "MAG_C", "CRR4", "AD", "CHN2", 1.0, True, 1),
    ]
    for cluster_id, representative, member, sample, disease, group, ani, is_rep, count in lineage_specs:
        row = {column: "" for column in service.HEADERS[service.LINEAGE]}
        row.update({
            "cluster_id": cluster_id, "representative_mag": representative, "member_mag": member,
            "is_representative": str(is_rep).lower(), "cluster_member_count": str(count),
            "representative_source_sample_id": "CRR1" if representative == "MAG_A" else sample,
            "representative_sample_name": "rep", "representative_sample_accession": "SAMC_REP",
            "representative_disease": "NC" if representative == "MAG_A" else disease,
            "representative_group": "CHN", "representative_hpc_batch": "1",
            "member_source_sample_id": sample, "member_sample_name": sample.lower(),
            "member_sample_accession": f"SAMC_{sample}", "member_disease": disease,
            "member_group": group, "member_hpc_batch": "1", "member_to_rep_ani": str(ani),
            "member_to_rep_alignment_coverage": "0.8", "ani_direction": "representative_reference__member_query",
            "member_completeness_percent": "90", "member_contamination_percent": "2",
            "representative_completeness_percent": "95", "representative_contamination_percent": "1",
            "representative_score": "85", "secondary_cluster_distance_threshold": "0.05",
            "equivalent_ani_threshold": "0.95", "cluster_method": "average",
            "comparison_algorithm": "fastANI", "primary_cluster": cluster_id.removeprefix("c"),
        })
        lineage_rows.append(row)
    with (root / service.LINEAGE).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=service.HEADERS[service.LINEAGE], delimiter="\t")
        writer.writeheader()
        writer.writerows(lineage_rows)

    crosswalk_rows = []
    statuses = list(service.MAPPING_STATUSES)
    for mag_id, status in zip(("MAG_A", "MAG_B", "MAG_C"), statuses, strict=True):
        row = {column: "" for column in service.HEADERS[service.CROSSWALK]}
        row.update({
            "MAG_ID": mag_id, "gtdb_species": f"Species {mag_id}", "gtdb_classification": "d__Bacteria;s__Species",
            "gtdb_reference_accession": "GCA_1" if status != "no_gtdb_reference" else "",
            "gtdb_reference_ani": "97" if status != "no_gtdb_reference" else "",
            "gtdb_reference_af": "0.8" if status != "no_gtdb_reference" else "",
            "ncbi_species_taxid": "123" if status != "no_gtdb_reference" else "",
            "ncbi_organism_name": "Species A" if status != "no_gtdb_reference" else "",
            "kraken_species_id": "123" if status == "matched_exact_ncbi_species_taxid" else "",
            "kraken_species_name": "Species A" if status == "matched_exact_ncbi_species_taxid" else "",
            "mapping_confidence": "exact" if status == "matched_exact_ncbi_species_taxid" else "unresolved",
            "mapping_status": status,
        })
        crosswalk_rows.append(row)
    with (root / service.CROSSWALK).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=service.HEADERS[service.CROSSWALK], delimiter="\t")
        writer.writeheader()
        writer.writerows(crosswalk_rows)

    for name in (service.PACKAGE_README, service.INTEGRATION_PLAN, service.QA_REPORT):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {name}\n", encoding="utf-8")
    manifest_files = []
    for name in service.V3_FILES:
        if name == service.V3_MANIFEST:
            continue
        content = (root / name).read_bytes()
        manifest_files.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    manifest = {
        "version": "mag_v3", "representativeMagCount": 3, "memberMagCount": 4,
        "secondaryClusterCount": 3, "buildDate": "2026-09-07", "status": "validated_self_contained_handoff",
        "tools": {"taxonomy": {"name": "GTDB-Tk", "version": "2.7.2", "databaseRelease": "R232"},
                  "quality": {"name": "CheckM2", "version": "1.1.0"}},
        "files": manifest_files,
    }
    (root / service.V3_MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    return package


V3_CONTRACT = service.MagContract(
    4, 3, 2, 2, members=4, clusters=3, low_ani_members=1,
    crosswalk_exact=1, crosswalk_not_observed=1, crosswalk_unresolved=1,
)


@pytest.fixture
def client_v3(package_v3, monkeypatch):
    monkeypatch.setattr(
        mag.service,
        "load_mag_dataset",
        lambda: load_fixture_original(package_v3, V3_CONTRACT, version="mag_v3"),
    )
    return TestClient(app)


def test_api_pagination_downloads_audit_and_revision_guard(client):
    first = client.get("/api/mag/features?limit=1&sortBy=magId&direction=asc").json()
    second = client.get("/api/mag/features?limit=1&offset=1&sortBy=magId&direction=asc").json()
    assert first["items"][0]["magId"] == "MAG_A"
    assert second["items"][0]["magId"] == "MAG_B"
    assert first["total"] == 3
    revision = first["provenance"]["dataFingerprint"]
    assert client.get("/api/mag/features?revision=wrong").status_code == 409
    response = client.get(f"/api/mag/downloads/features?query=MAG_A&revision={revision}")
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert len(rows) == 1
    assert float(rows[0]["qValue"]) == first["items"][0]["qValue"]
    assert rows[0]["dataFingerprint"] == revision
    response = client.get("/api/mag/downloads/matrix?gender=F")
    matrix = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert len(matrix) == 2
    assert matrix[0]["MAG_B"] == "0.0"  # zeros retained in dense export
    audit = client.get("/api/mag/downloads/provenance?gender=F").json()
    assert audit["sampleIds"] == ["CRR1", "CRR3"]
    assert "/private/r1" not in json.dumps(audit)
    assert len(audit["sources"]) == 5
    assert audit["excludedSampleCount"] == 2
    audit = client.get("/api/mag/downloads/provenance?view=heatmap&topN=1").json()
    assert audit["display"]["displayedMagIds"] == ["MAG_C"]
    assert audit["display"]["colorTransform"] == "log10(1 + abundance_percent)"
    assert len(audit["projectionFingerprint"]) == 64
    csv_all = client.get("/api/mag/downloads/features?limit=1&offset=1")
    assert len(list(csv.DictReader(io.StringIO(csv_all.content.decode("utf-8-sig"))))) == 3
    samples = client.get("/api/mag/samples?batch=1").json()
    assert len(samples["items"]) == 2
    distribution = client.get("/api/mag/features/MAG_A").json()
    assert len(distribution["samples"]) == 4
    assert distribution["boxes"][0]["values"][2] == 8
    heatmap = client.get("/api/mag/heatmap?topN=1").json()
    assert heatmap["magIds"] == ["MAG_C"]
    assert heatmap["samples"][0]["disease"] == "AD"
    assert heatmap["values"][0][0] == 24


@pytest.mark.parametrize("path", [
    "features?limit=301", "features?offset=-1", "features?sortBy=invalid",
    "overview?ageMin=80&ageMax=60", "overview?ageMin=nan", "overview?batch=99",
    "overview?abundanceThresholdPercent=-1", "heatmap?topN=1001", "heatmap?topN=-1",
    "heatmap?minMean=nan", "heatmap?sampleOrder=invalid", "heatmap?maxQ=2",
])
def test_api_rejects_invalid_parameters(client, path):
    assert client.get(f"/api/mag/{path}").status_code == 422


def test_heatmap_filters_before_display_limit_and_preserves_test_family(client):
    result = client.get("/api/mag/heatmap?sampleThreshold=3&minSamplePercent=50&topN=1").json()
    assert result["magIds"] == ["MAG_C"]
    assert result["selectionAudit"]["matchedCount"] == 2
    assert result["selectionAudit"]["omittedCount"] == 1
    assert result["selectionAudit"]["exclusions"][-1]["count"] == 1
    assert result["provenance"]["testedFeatureCount"] == 3
    reference = client.get("/api/mag/features").json()["items"][0]
    assert result["features"][0]["qValue"] == reference["qValue"]
    # The global technical threshold cannot silently become a heatmap filter.
    assert client.get("/api/mag/heatmap?abundanceThresholdPercent=99&topN=0").json()["magIds"] == ["MAG_C", "MAG_A", "MAG_B"]


def test_heatmap_all_rows_variance_and_empty_scope(client):
    assert len(client.get("/api/mag/heatmap?topN=100").json()["magIds"]) == 3
    variance = client.get("/api/mag/heatmap?heatmapMode=variance&topN=0").json()
    assert set(variance["magIds"]) == {"MAG_A", "MAG_C"}
    assert variance["selectionAudit"]["exclusions"][-1] == {"reason": "零变异 MAG", "count": 1}
    empty = client.get("/api/mag/heatmap?ageMin=90&sampleOrder=cluster&rowOrder=cluster&colorMode=rowZ").json()
    assert empty["magIds"] == [] and empty["displayValues"] == []


def test_heatmap_manual_candidates_and_invalid_ids(client):
    result = client.get("/api/mag/heatmap", params={"heatmapMode": "candidate", "candidateKind": "manual", "heatmapIds": "MAG_A,MAG_C,MAG_A", "topN": 0}).json()
    assert result["magIds"] == ["MAG_A", "MAG_C"]
    empty = client.get("/api/mag/heatmap?heatmapMode=candidate&candidateKind=manual").json()
    assert empty["magIds"] == [] and empty["warnings"]
    assert client.get("/api/mag/heatmap?heatmapMode=candidate&candidateKind=manual&heatmapIds=UNKNOWN").status_code == 422
    no_hits = client.get("/api/mag/heatmap?heatmapMode=candidate&maxQ=0").json()
    assert no_hits["magIds"] == []
    single_group = client.get("/api/mag/heatmap?heatmapMode=candidate&disease=AD").json()
    assert single_group["magIds"] == [] and single_group["warnings"]


def test_heatmap_z_score_constant_rows_and_raw_values(client):
    result = client.get("/api/mag/heatmap?topN=0&colorMode=rowZ").json()
    raw, display = np.asarray(result["values"]), np.asarray(result["displayValues"])
    column = result["magIds"].index("MAG_A")
    log = np.log10(1 + raw[:, column])
    np.testing.assert_allclose(display[:, column], (log - log.mean()) / log.std())
    assert result["constantMagIds"] == ["MAG_B"]
    assert (display[:, result["magIds"].index("MAG_B")] == 0).all()
    assert result["warnings"]
    assert raw[0, column] == 6  # raw AD / CRR3 value retained


def test_heatmap_quality_conditions_use_verified_annotations(client_v3):
    result = client_v3.get("/api/mag/heatmap?topN=0&minCompleteness=90&maxContamination=5").json()
    assert set(result["magIds"]) == {"MAG_A", "MAG_C"}
    assert result["selectionAudit"]["exclusions"][1]["count"] == 1


def test_heatmap_clustering_keeps_id_value_alignment_and_is_reproducible(client):
    first = client.get("/api/mag/heatmap?topN=0&colorMode=rowZ&rowOrder=cluster&sampleOrder=withinGroup").json()
    second = client.get("/api/mag/heatmap?topN=0&colorMode=rowZ&rowOrder=cluster&sampleOrder=withinGroup").json()
    assert first["magIds"] == second["magIds"] and first["samples"] == second["samples"]
    assert [s["disease"] for s in first["samples"]] == ["AD", "AD", "NC", "NC"]
    source = {"CRR1": {"MAG_A": 1, "MAG_B": 0, "MAG_C": 9}, "CRR2": {"MAG_A": 3, "MAG_B": 0, "MAG_C": 17},
              "CRR3": {"MAG_A": 6, "MAG_B": 0, "MAG_C": 24}, "CRR4": {"MAG_A": 10, "MAG_B": 0, "MAG_C": 30}}
    for s, row in zip(first["samples"], first["values"], strict=True):
        assert row == [source[s["sampleId"]][mag_id] for mag_id in first["magIds"]]
    full = client.get("/api/mag/heatmap?topN=0&sampleOrder=cluster").json()
    assert set(s["sampleId"] for s in full["samples"]) == set(source)
    assert first["projectionFingerprint"] != full["projectionFingerprint"]
    def leaves(tree):
        order = leaves_list(np.asarray(tree["merges"])) if tree["merges"] else range(len(tree["leafIds"]))
        return [tree["leafIds"][i] for i in order]

    assert first["dendrograms"] == second["dendrograms"]
    assert first["dendrograms"]["metric"] == "euclidean"
    assert first["dendrograms"]["linkage"] == "average"
    assert leaves(first["dendrograms"]["mags"]) == first["magIds"]
    sample_trees = first["dendrograms"]["samples"]
    assert [tree["group"] for tree in sample_trees] == ["AD", "NC"]
    assert [id_ for tree in sample_trees for id_ in leaves(tree)] == [s["sampleId"] for s in first["samples"]]
    assert leaves(full["dendrograms"]["samples"][0]) == [s["sampleId"] for s in full["samples"]]
    assert len(full["dendrograms"]["samples"][0]["merges"]) == len(full["samples"]) - 1


def test_heatmap_dendrograms_are_absent_without_clustering_and_safe_for_singletons(client):
    plain = client.get("/api/mag/heatmap?topN=1").json()
    assert plain["dendrograms"]["mags"] is None
    assert plain["dendrograms"]["samples"] == []
    single = client.get("/api/mag/heatmap?topN=1&rowOrder=cluster&ageMin=74&sampleOrder=cluster").json()
    assert single["dendrograms"]["mags"]["merges"] == []
    for tree in single["dendrograms"]["samples"]:
        assert len(tree["merges"]) == max(0, len(tree["leafIds"]) - 1)


def test_heatmap_exports_selected_raw_matrix_and_exact_method_audit(client):
    params = {"view": "heatmap", "topN": 0, "heatmapMode": "candidate", "candidateKind": "manual", "heatmapIds": "MAG_A", "colorMode": "rowZ", "sampleOrder": "withinGroup"}
    result = client.get("/api/mag/heatmap", params=params).json()
    audit = client.get("/api/mag/downloads/provenance", params=params).json()
    assert audit["display"]["displayedMagIds"] == result["magIds"]
    assert audit["display"]["heatmapSettings"] == result["settings"]
    assert audit["display"]["methods"] == result["methods"]
    csv_rows = list(csv.DictReader(io.StringIO(client.get("/api/mag/downloads/heatmap", params=params).content.decode("utf-8-sig"))))
    assert "MAG_C" not in csv_rows[0] and float(csv_rows[0]["MAG_A"]) in {6, 10}
    assert csv_rows[0]["projectionFingerprint"] == result["projectionFingerprint"]


def test_data_failure_reports_without_impacting_liveness(package, client):
    assert client.get("/api/mag/overview").status_code == 200
    (package / "development_input" / "mag_v1" / service.LENGTHS).unlink()
    response = client.get("/api/mag/overview")
    assert response.status_code == 503
    assert response.json()["report"]["reproduce"] == "npm run validate:mag"
    assert client.get("/api/health/live").status_code == 200


def test_unknown_feature_and_empty_cohort(client):
    assert client.get("/api/mag/features/unknown").status_code == 404
    response = client.get("/api/mag/heatmap?ageMin=90")
    assert response.status_code == 200
    assert response.json()["values"] == []
    assert client.get("/api/mag/features?ageMin=90").json()["items"][0]["meanPercent"] is None


def test_configured_version_selects_matching_directory(package):
    result = prepare_mag_v2.build(package, "mag_v1", "mag_v2", service.MagContract(4, 3, 2, 2))
    assert result["taxonomyRows"] == 3
    assert result["qualityRows"] == 3
    data = service.load_mag_dataset(package, service.MagContract(4, 3, 2, 2), version="mag_v2")
    assert data.version == "mag_v2"
    assert data.sources[0]["file"].startswith("development_input/mag_v2/")
    assert len(data.taxonomy) == 3
    assert len(data.quality) == 3
    assert service.provenance(data, service.MagScope())["upstreamGeneration"]["tool"] == "CoverM"


def test_v2_taxonomy_quality_api_and_downloads(client_v2):
    overview = client_v2.get("/api/mag/overview").json()
    assert overview["capabilities"] == {"taxonomy": True, "quality": True, "lineage": False, "crosswalk": False}
    taxonomy = client_v2.get("/api/mag/taxonomy?rank=species&topN=5").json()
    assert taxonomy["totalMagCount"] == 3
    assert taxonomy["resolvedMagCount"] == 2
    assert taxonomy["unresolvedMagCount"] == 1
    assert sum(item["count"] for item in taxonomy["items"]) == 3
    quality = client_v2.get("/api/mag/quality").json()
    catalog = client_v2.get("/api/mag/catalog?disease=AD&ageMin=120").json()
    assert catalog["scopeKind"] == "catalog"
    assert catalog["total"] == 3
    assert catalog["provenance"]["sampleCount"] == 4
    by_id = {row["magId"]: row for row in catalog["items"]}
    assert by_id["MAG_A"]["taxonomy"]["closestAni"] == 99
    assert by_id["MAG_B"]["taxonomy"]["closestReference"] is None
    assert by_id["MAG_A"]["quality"]["contigN50Bp"] == 500
    assert by_id["MAG_A"]["taxonomy"]["class"] == "C1"
    assert client_v2.get("/api/mag/catalog?revision=stale").status_code == 409
    assert quality["summary"]["referenceBandCount"] == 2
    assert quality["referenceBand"]["label"].endswith("非 MIMAG 高质量判定）")
    assert len(quality["items"]) == 3
    taxonomy_csv = client_v2.get("/api/mag/downloads/taxonomy")
    quality_csv = client_v2.get("/api/mag/downloads/quality")
    phylum = client_v2.get("/api/mag/downloads/provenance?view=taxonomy&rank=phylum&topN=5").json()
    genus = client_v2.get("/api/mag/downloads/provenance?view=taxonomy&rank=genus&topN=5").json()
    assert phylum["display"]["taxonomyRank"] == "phylum"
    assert genus["display"]["taxonomyRank"] == "genus"
    assert phylum["projectionFingerprint"] != genus["projectionFingerprint"]
    assert len(list(csv.DictReader(io.StringIO(taxonomy_csv.content.decode("utf-8-sig"))))) == 3
    assert len(list(csv.DictReader(io.StringIO(quality_csv.content.decode("utf-8-sig"))))) == 3


def test_feature_annotations_join_by_mag_id_and_preserve_missing_species(client_v2):
    rows = {row["magId"]: row for row in client_v2.get("/api/mag/features").json()["items"]}
    assert rows["MAG_A"]["taxonomyName"] == "S1"
    assert rows["MAG_A"]["taxonomyRank"] == "species"
    assert rows["MAG_A"]["completenessPercent"] == 95
    assert rows["MAG_B"]["taxonomyName"] == "G2"
    assert rows["MAG_B"]["taxonomyRank"] == "genus"
    assert rows["MAG_B"]["contaminationPercent"] == 6
    csv_rows = list(csv.DictReader(io.StringIO(client_v2.get("/api/mag/downloads/features").content.decode("utf-8-sig"))))
    assert json.loads(next(row for row in csv_rows if row["magId"] == "MAG_A")["taxonomy"])["species"] == "S1"


def test_feature_annotations_remain_missing_when_inputs_are_not_provided(client):
    missing = client.get("/api/mag/features/MAG_A").json()["feature"]
    assert missing["taxonomy"] == {}
    assert missing["completenessPercent"] is None


def test_classification_search_precedes_pagination_and_preserves_bh_family(client_v2):
    full = {row["magId"]: row for row in client_v2.get("/api/mag/features").json()["items"]}
    response = client_v2.get("/api/mag/features", params={"query": " p1 ", "limit": 1, "offset": 1}).json()
    assert response["total"] == 2  # A and B share a phylum; neither MAG ID contains P1.
    assert len(response["items"]) == 1
    assert response["provenance"]["testedFeatureCount"] == 3
    row = response["items"][0]
    assert row["qValue"] == full[row["magId"]]["qValue"]
    for query, expected in (("s1", "MAG_A"), ("g2", "MAG_B"), ("mag_c", "MAG_C")):
        match = client_v2.get("/api/mag/features", params={"query": query}).json()
        assert [item["magId"] for item in match["items"]] == [expected]
    exported = client_v2.get("/api/mag/downloads/features", params={"query": "P1", "limit": 1, "offset": 1, "topN": 1})
    assert {item["magId"] for item in csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig")))} == {"MAG_A", "MAG_B"}
    chart = client_v2.get("/api/mag/downloads/provenance", params={"view": "features", "query": "g2", "topN": 20}).json()
    assert chart["display"]["displayedMagIds"] == ["MAG_B"]
    assert client_v2.get("/api/mag/features", params={"query": "does-not-exist"}).json()["total"] == 0


def test_chart_provenance_does_not_follow_result_list_page_or_sort(client):
    first = client.get("/api/mag/downloads/provenance?view=features&topN=2&limit=1&offset=0").json()
    second = client.get("/api/mag/downloads/provenance?view=features&topN=2&limit=1&offset=2&sortBy=qValue&direction=asc").json()
    assert first["display"]["displayedMagIds"] == second["display"]["displayedMagIds"] == ["MAG_C", "MAG_A"]
    assert first["display"]["pageOffset"] != second["display"]["pageOffset"]
    assert second["display"]["chartSortBy"] == "meanPercent"
    restricted = client.get("/api/mag/downloads/provenance?view=features&topN=1&query=MAG_A&chartSortBy=adMeanPercent").json()
    assert restricted["display"]["displayedMagIds"] == ["MAG_A"]
    assert restricted["display"]["chartSortBy"] == "adMeanPercent"
    exported = client.get("/api/mag/downloads/features?view=features&topN=1&offset=2&limit=1")
    assert len(list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))) == 3


def test_all_chart_provenance_retains_search_and_ranking(client):
    audit = client.get("/api/mag/downloads/provenance?view=features&topN=0&limit=1&offset=2").json()
    assert audit["display"]["displayedMagIds"] == ["MAG_C", "MAG_A", "MAG_B"]
    selected = client.get("/api/mag/downloads/provenance?view=features&topN=0&query=MAG_A").json()
    assert selected["display"]["displayedMagIds"] == ["MAG_A"]


def test_version_rejects_path_escape(package):
    with pytest.raises(service.MagDataError, match="版本名格式"):
        service.load_mag_dataset(package, service.MagContract(4, 3, 2, 2), version="../mag_v1")


def test_v3_loader_validates_lineage_crosswalk_and_package_manifest(package_v3):
    data = service.load_mag_dataset(package_v3, V3_CONTRACT, version="mag_v3")
    assert len(data.lineage) == 4
    assert len(data.crosswalk) == 3
    assert sum(row["memberToRepAni"] < 0.95 for row in data.lineage) == 1
    audit = service.provenance(data, service.MagScope())
    assert audit["manifest"]["status"] == "validated_self_contained_handoff"
    assert audit["analysisVersion"] == "mag-exploration-v3"
    assert any("不是独立外部验证队列" in warning for warning in audit["warnings"])
    assert any("不证明 reads 已直接比对" in warning for warning in audit["warnings"])


def test_v3_lineage_crosswalk_api_pagination_filters_and_raw_downloads(client_v3):
    overview = client_v3.get("/api/mag/overview").json()
    assert overview["capabilities"] == {"taxonomy": True, "quality": True, "lineage": True, "crosswalk": True}
    revision = overview["provenance"]["dataFingerprint"]

    clusters = client_v3.get("/api/mag/lineage/clusters?limit=1&lowAniOnly=true").json()
    assert clusters["total"] == 1
    assert clusters["items"][0]["clusterId"] == "c1"
    assert clusters["summary"] == {
        "memberMagCount": 4, "representativeMagCount": 3, "secondaryClusterCount": 3,
        "sourceSampleCount": 4, "below095AniCount": 1,
    }
    detail = client_v3.get("/api/mag/lineage/clusters/c1?limit=1&sortBy=memberToRepAni").json()
    assert detail["total"] == 2
    assert detail["items"][0]["memberMag"] == "MEMBER_X"
    trace = client_v3.get("/api/mag/lineage/mags/MEMBER_X").json()
    assert trace["queryRole"] == "member"
    assert trace["member"]["memberToRepAni"] == 0.949
    assert trace["crosswalk"]["mappingStatus"] == "matched_exact_ncbi_species_taxid"

    crosswalk = client_v3.get("/api/mag/crosswalk?mappingStatus=ncbi_species_taxid_not_observed_in_reads").json()
    assert crosswalk["total"] == 1
    assert crosswalk["statusCounts"] == {
        "matched_exact_ncbi_species_taxid": 1,
        "ncbi_species_taxid_not_observed_in_reads": 1,
        "no_gtdb_reference": 1,
    }
    lineage_download = client_v3.get(f"/api/mag/downloads/lineage?revision={revision}")
    crosswalk_download = client_v3.get(f"/api/mag/downloads/crosswalk?revision={revision}")
    assert lineage_download.status_code == 200
    assert lineage_download.headers["content-type"].startswith("text/tab-separated-values")
    assert lineage_download.headers["x-data-fingerprint"] == revision
    assert len(list(csv.DictReader(io.StringIO(lineage_download.text), delimiter="\t"))) == 4
    assert len(list(csv.DictReader(io.StringIO(crosswalk_download.text), delimiter="\t"))) == 3
    assert client_v3.get("/api/mag/lineage/clusters?limit=301").status_code == 422
    assert client_v3.get("/api/mag/crosswalk?mappingStatus=invalid").status_code == 422
    assert client_v3.get("/api/mag/lineage/mags/unknown").status_code == 404


def test_v3_manifest_hash_mismatch_fails_closed(package_v3):
    service.load_mag_dataset(package_v3, V3_CONTRACT, version="mag_v3")
    path = package_v3 / "development_input" / "mag_v3" / service.CROSSWALK
    path.write_text(path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(service.MagDataError, match="bytes|SHA-256"):
        service.load_mag_dataset(package_v3, V3_CONTRACT, version="mag_v3")


@pytest.mark.parametrize("endpoint", ["features", "lineage/clusters", "lineage/clusters/c1", "crosswalk"])
def test_query_lists_accept_300_rows_and_reject_larger_pages(client_v3, endpoint):
    response = client_v3.get(f"/api/mag/{endpoint}?limit=300")
    assert response.status_code == 200
    assert response.json()["limit"] == 300
    assert client_v3.get(f"/api/mag/{endpoint}?limit=301").status_code == 422
