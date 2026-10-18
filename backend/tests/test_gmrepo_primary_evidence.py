import sqlite3
import hashlib
import json
from contextlib import contextmanager

import pytest

from app.services import gmrepo_primary_evidence as service


@pytest.fixture
def primary_db(tmp_path, monkeypatch):
    path = tmp_path / "primary.sqlite3"
    with sqlite3.connect(path) as conn:
        conn.executescript("""
          CREATE TABLE datasets (slug TEXT, status TEXT, current_revision_id INTEGER);
          CREATE TABLE dataset_revisions (id INTEGER, revision_key TEXT, source_sha256 TEXT, abundance_scale TEXT, normalization TEXT, status TEXT);
          CREATE TABLE revision_sample_info (revision_id INTEGER, sample_code TEXT, phenotype TEXT);
          CREATE TABLE taxon_anno (taxon_id INTEGER, kingdom TEXT, genus TEXT, species TEXT, full_taxonomy TEXT);
          CREATE TABLE revision_species_abundance (revision_id INTEGER, taxon_id INTEGER);
          INSERT INTO datasets VALUES ('ad-nc-species', 'published', 5);
          INSERT INTO dataset_revisions VALUES (5, 'current-version', 'current-sha', 'unknown', 'unknown', 'published');
          INSERT INTO dataset_revisions VALUES (4, 'old-version', 'old-sha', 'percent', 'total_sum', 'published');
          INSERT INTO revision_sample_info VALUES (5, 'CRR1', 'AD'), (5, 'CRR2', 'NC'), (4, 'ERR1', 'AD');
          INSERT INTO taxon_anno VALUES (1, 'Bacteria', 'Klebsiella', 'Klebsiella_pneumoniae', 'k__Bacteria|g__Klebsiella|s__Klebsiella_pneumoniae');
          INSERT INTO taxon_anno VALUES (2, 'Bacteria', 'Raoultella', 'Raoultella_ornithinolytica', 'k__Bacteria|g__Raoultella|s__Raoultella_ornithinolytica');
          INSERT INTO taxon_anno VALUES (3, 'Bacteria', 'Klebsiella', 'Old_feature', 'old');
          INSERT INTO taxon_anno VALUES (4, 'Archaea', 'Klebsiella', 'Wrong_domain', 'wrong');
          INSERT INTO revision_species_abundance VALUES (5, 1), (5, 1), (5, 2), (4, 3), (5, 4);
        """)

    @contextmanager
    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr(service, "connect", connect)
    service._taxonomy.cache_clear()
    yield path
    service._taxonomy.cache_clear()


def test_primary_name_matching_is_domain_and_revision_scoped_and_keeps_unknown_units(primary_db):
    genus = {"name": "Klebsiella", "sourceNames": ["Klebsiella", "Raoultella"], "domain": "Bacteria"}
    result = service.primary_evidence(genus)
    assert result["status"] == "available"
    assert result["datasetRevision"] == "current-version"
    assert result["sourceSha256"] == "current-sha"
    assert result["matchedFeatureCount"] == 2
    assert {r["featureId"] for r in result["speciesPreview"]} == {"1", "2"}
    assert result["groupCounts"] == {"AD": 1, "NC": 1}
    assert result["abundanceScale"] == "unknown"
    assert result["quantitativeStatus"] == "blocked"
    assert any("unknown" in reason for reason in result["reasons"])


def test_no_name_overlap_is_not_a_negative_replication_claim(primary_db):
    result = service.primary_evidence({"name": "Bacteroides", "sourceNames": ["Bacteroides"], "domain": "Bacteria"})
    assert result["status"] == "available"
    assert result["matchedFeatureCount"] == 0
    assert result["quantitativeStatus"] == "blocked"


def test_unavailable_primary_data_does_not_break_reference_results(monkeypatch):
    @contextmanager
    def unavailable():
        raise sqlite3.OperationalError("unavailable")
        yield

    monkeypatch.setattr(service, "connect", unavailable)
    result = service.primary_evidence({"name": "Bacteroides", "sourceNames": ["Bacteroides"], "domain": "Bacteria"})
    assert result["status"] == "unavailable"
    assert result["sourceSha256"] is None


def test_reported_people_do_not_create_subject_ids_and_changed_source_fails_closed(tmp_path, monkeypatch):
    backend = tmp_path / "backend"
    backend.mkdir()
    mapping = tmp_path / "sample-map.tsv"
    mapping.write_text("run_accession\tstage\thost_subject_id_raw\nCRR1\tAD\t\nCRR2\tNC\t\n")
    context = tmp_path / "context.json"
    context.write_text(json.dumps({"sampleCount": 2, "sampleSetSha256": hashlib.sha256(b"CRR1\nCRR2").hexdigest(),
                                   "groupCounts": {"AD": 1, "NC": 1}, "participantStatus": "study_reported_person_counts_no_rowwise_subject_verification",
                                   "sources": [{"sourceId": "primary-sample-map", "path": "sample-map.tsv", "bytes": mapping.stat().st_size,
                                                "sha256": hashlib.sha256(mapping.read_bytes()).hexdigest()}]}))
    monkeypatch.setattr(service, "BACKEND_ROOT", backend)
    monkeypatch.setattr(service, "CONTEXT_PATH", context)
    actual = service.cohort_context()
    assert actual["status"] == "source_bound"
    assert actual["participantIdsAvailable"] == 0 and actual["rowwiseParticipantVerification"] is False
    mapping.write_text(mapping.read_text().replace("CRR2", "CRR1"))
    assert service.cohort_context()["status"] == "unavailable_or_changed"


def test_known_scale_does_not_inherit_the_old_unknown_unit_warning(primary_db):
    with sqlite3.connect(primary_db) as conn:
        conn.execute("UPDATE dataset_revisions SET abundance_scale='relative_abundance_fraction', normalization='metaphlan_percent_divided_by_100' WHERE id=5")
    result = service.primary_evidence({"name": "Klebsiella", "sourceNames": ["Klebsiella"], "domain": "Bacteria"})
    assert not any("unknown" in r for r in result["reasons"])
    assert result["quantitativeStatus"] == "blocked"
