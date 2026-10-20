from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import mag
from app.main import app
from app.services import mag_analysis_service as service
from app.services.mag_suggestions import suggestions


def fixture():
    return SimpleNamespace(fingerprint="revision-a", lineage=[
        {"clusterId": "c1", "representativeMag": "MAG_A", "isRepresentative": True},
        {"clusterId": "c1", "representativeMag": "MAG_A", "isRepresentative": False},
    ], taxonomy=[{"magId": "MAG_A", "species": "Species alpha"}], crosswalk=[
        {"magId": "MAG_A", "gtdbSpecies": "Species alpha", "ncbiOrganismName": "Species alpha", "krakenSpeciesName": "NCBI alias"},
        {"magId": "MAG_B", "gtdbSpecies": "Species alpha", "ncbiOrganismName": "Species alpha", "krakenSpeciesName": None},
    ])


def test_distinguishes_taxon_queries_from_exact_ids_and_counts_unique_mags():
    result = suggestions(fixture(), context="crosswalk", query="Species ALPHA", limit=20)
    assert next(item for item in result["items"] if item["kind"] == "分类")["count"] == 2
    assert result["revision"] == "revision-a"
    assert suggestions(fixture(), context="crosswalk", query="MAG_B", limit=20)["items"][0]["value"] == "MAG_B"
    assert suggestions(fixture(), context="crosswalk", query="NCBI alias", limit=20)["total"] > 0


def test_lineage_deduplicates_clusters_and_never_fuzzy_matches_ids():
    result = suggestions(fixture(), context="lineage", query="c1", limit=20)
    assert result["total"] == 1
    assert result["items"][0]["value"] == "c1"
    assert suggestions(fixture(), context="lineage", query="MAG_Z", limit=20)["items"] == []
    assert suggestions(fixture(), context="crosswalk", query="Speces alpha", limit=20)["items"][0]["approximate"]


def test_endpoint_bounds_response_and_validates_inputs():
    app.dependency_overrides[mag.dataset] = fixture
    try:
        with TestClient(app) as client:
            result = client.get("/api/mag/suggestions", params={"context": "crosswalk", "limit": 1}).json()
            assert len(result["items"]) == 1 < result["total"]
            for params in [{"limit": 51}, {"query": "x" * 201}, {"context": "unknown"}]:
                assert client.get("/api/mag/suggestions", params=params).status_code == 422
    finally:
        app.dependency_overrides.pop(mag.dataset, None)


def test_exact_id_query_does_not_include_longer_ids(monkeypatch):
    rows = [{"magId": value, "taxonomy": {"species": "Species alpha"}, "meanPercent": 1} for value in ("MAG_A", "MAG_A1")]
    monkeypatch.setattr(service, "comparison_rows", lambda *_: rows)
    data = SimpleNamespace(mag_ids=("MAG_A", "MAG_A1"))
    assert [row["magId"] for row in service.ordered_features(data, service.MagScope(), "mag_a")] == ["MAG_A"]
    assert len(service.ordered_features(data, service.MagScope(), "Species alpha")) == 2
