import csv
import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
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


def test_missing_file_counts_and_path_escape(package):
    with pytest.raises(service.MagDataError, match="872"):
        service.load_mag_dataset(package, version="mag_v1")
    path = package / "development_input" / "mag_v1" / service.LENGTHS
    path.unlink()
    with pytest.raises(service.MagDataError, match="存在且可读"):
        load(package)
    path.symlink_to(Path(__file__))
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
    "features?limit=101", "features?offset=-1", "features?sortBy=invalid",
    "overview?ageMin=80&ageMax=60", "overview?ageMin=nan", "overview?batch=99",
    "overview?abundanceThresholdPercent=-1", "heatmap?topN=51",
])
def test_api_rejects_invalid_parameters(client, path):
    assert client.get(f"/api/mag/{path}").status_code == 422


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
    assert overview["capabilities"] == {"taxonomy": True, "quality": True}
    taxonomy = client_v2.get("/api/mag/taxonomy?rank=species&topN=5").json()
    assert taxonomy["totalMagCount"] == 3
    assert taxonomy["resolvedMagCount"] == 2
    assert taxonomy["unresolvedMagCount"] == 1
    assert sum(item["count"] for item in taxonomy["items"]) == 3
    quality = client_v2.get("/api/mag/quality").json()
    assert quality["summary"]["referenceBandCount"] == 2
    assert quality["referenceBand"]["label"].endswith("非 MIMAG 高质量判定）")
    assert len(quality["items"]) == 3
    taxonomy_csv = client_v2.get("/api/mag/downloads/taxonomy")
    quality_csv = client_v2.get("/api/mag/downloads/quality")
    assert len(list(csv.DictReader(io.StringIO(taxonomy_csv.content.decode("utf-8-sig"))))) == 3
    assert len(list(csv.DictReader(io.StringIO(quality_csv.content.decode("utf-8-sig"))))) == 3


def test_version_rejects_path_escape(package):
    with pytest.raises(service.MagDataError, match="版本名格式"):
        service.load_mag_dataset(package, service.MagContract(4, 3, 2, 2), version="../mag_v1")
