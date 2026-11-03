"""Rebinding local inputs must not turn absent study evidence into certification."""
import hashlib
import json
import sqlite3
from contextlib import contextmanager

import pytest
from test_metaphlan_import import fixture as metaphlan_files

from app.cli import rebind_gmrepo_primary_context as repair
from app.services import gmrepo_primary_evidence as evidence
from app.services import gmrepo_primary_genus as primary
from app.services.metaphlan_import import normalize_metaphlan


@pytest.fixture
def local_inputs(tmp_path, monkeypatch):
    backend = tmp_path / "backend"
    raw = backend / "storage/raw/species"
    raw.mkdir(parents=True)
    source, metadata = metaphlan_files(raw)
    matrix, _ = normalize_metaphlan(source, metadata)
    provenance = backend / "storage/provenance/CRA014435/2026-10-01"
    provenance.mkdir(parents=True)
    mapping = provenance / "samples_current185.tsv"
    mapping.write_text("run_accession\tstage\thost_subject_id_raw\tlocal_age\n"
                       + "".join(f"{r.sample_id}\t{r.Group}\t\t65\n" for r in matrix.itertuples()))
    context = backend / "metadata/gmrepo_primary_context.json"
    context.parent.mkdir()
    context.write_text(json.dumps({"schemaVersion": 1, "cohortId": "test-runs", "sampleCount": 4,
        "sampleSetSha256": hashlib.sha256("\n".join(sorted(matrix.sample_id)).encode()).hexdigest(),
        "groupCounts": {"AD": 2, "NC": 2}, "projectUrl": "https://example.org/project",
        "publicationUrl": "https://example.org/paper", "participantNote": "Archived claim: 476 participants.",
        "sources": [{"sourceId": "primary-sample-map", "path": "missing-closeout/primary-sample-map.tsv",
                     "bytes": mapping.stat().st_size, "sha256": hashlib.sha256(mapping.read_bytes()).hexdigest()},
                    {"sourceId": "primary-paper-record", "path": "missing-closeout/paper.json", "bytes": 1, "sha256": "absent"}]}))
    (backend / "storage_manifest.json").write_text(json.dumps({"datasets": [{"slug": "test",
        "inputFormat": "metaphlan4_taxonomy", "file": "storage/raw/species/taxonomy.tsv",
        "sampleMetadataFile": "storage/raw/species/samples.tsv"}]}))
    db = tmp_path / "test.sqlite3"
    with sqlite3.connect(db) as conn:
        conn.executescript("""
            CREATE TABLE datasets (slug TEXT,status TEXT,current_revision_id INTEGER);
            CREATE TABLE dataset_revisions (id INTEGER,revision_key TEXT,source_sha256 TEXT,
                abundance_scale TEXT,normalization TEXT,validation_json TEXT,status TEXT);
            CREATE TABLE revision_sample_info (revision_id INTEGER,sample_id INTEGER,sample_code TEXT,phenotype TEXT);
            CREATE TABLE taxon_anno (taxon_id INTEGER,full_taxonomy TEXT);
            CREATE TABLE revision_species_abundance (revision_id INTEGER,sample_id INTEGER,taxon_id INTEGER,abundance REAL);
            INSERT INTO datasets VALUES ('test','published',1);
        """)
        conn.execute("INSERT INTO dataset_revisions VALUES (1,'fixed-species',?,'relative_abundance','MetaPhlAn 4 percent / 100',?,'published')",
                     (hashlib.sha256(source.read_bytes()).hexdigest(), json.dumps({"featureCount": 2})))
        for index, name in enumerate(matrix.columns[2:], 1):
            conn.execute("INSERT INTO taxon_anno VALUES (?,?)", (index, name))
        for index, row in enumerate(matrix.itertuples(index=False, name=None), 1):
            conn.execute("INSERT INTO revision_sample_info VALUES (1,?,?,?)", (index, row[0], row[1]))
            for taxon, value in enumerate(row[2:], 1):
                conn.execute("INSERT INTO revision_species_abundance VALUES (1,?,?,?)", (index, taxon, value))

    @contextmanager
    def connect():
        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            yield conn

    monkeypatch.setattr(repair, "BACKEND_ROOT", backend)
    monkeypatch.setattr(repair, "connect", connect)
    monkeypatch.setattr(evidence, "BACKEND_ROOT", backend)
    monkeypatch.setattr(evidence, "CONTEXT_PATH", context)
    monkeypatch.setattr(primary, "connect", connect)
    return tmp_path, context, mapping, source, db


def test_dry_run_is_read_only_and_verifies_every_published_cell(local_inputs):
    root, context, mapping, source, db = local_inputs
    before = {p: p.read_bytes() for p in (context, mapping, source, db)}
    output = root / "new-context"
    result = repair.rebind(output, "test")
    assert result["matrixComparison"]["status"] == "passed"
    assert result["comparedAbundanceCells"] == 8
    assert result["participantIdsAvailable"] == 0
    assert result["historicalSourceChecks"] == {"unavailable": 2}
    assert result["applied"] is False and not output.exists()
    assert before == {p: p.read_bytes() for p in before}


def test_new_scope_preserves_old_context_and_never_inherits_person_claims(local_inputs):
    root, context, mapping, source, _ = local_inputs
    old, original_map, original_source = context.read_bytes(), mapping.read_bytes(), source.read_bytes()
    original_mode = context.stat().st_mode
    output = root / "new-context"
    result = repair.rebind(output, "test", apply=True)
    current = evidence.cohort_context()
    assert result["applied"] is True and current["status"] == "source_bound"
    assert context.stat().st_mode == original_mode
    assert current["evidenceScope"] == "verified_local_analysis_inputs"
    assert current["sourceRevision"] == "fixed-species"
    assert current["participantIdsAvailable"] == 0 and current["rowwiseParticipantVerification"] is False
    assert "476" not in current["participantNote"]
    assert (output / "previous-context.json").read_bytes() == old
    assert (output / "primary-sample-map.tsv").read_bytes() == mapping.read_bytes() == original_map
    assert source.read_bytes() == original_source
    assert json.loads((output / "historical-source-checks.json").read_bytes())[1]["availability"] == "unavailable"
    with pytest.raises(ValueError, match="new snapshot directory"):
        repair.rebind(output, "test", apply=True)
    source.write_bytes(original_source.replace(b"25\t30", b"26\t30", 1))
    assert evidence.cohort_context()["status"] == "unavailable_or_changed"


def test_same_scope_with_changed_covariate_bytes_is_not_accepted(local_inputs):
    root, context, mapping, _, _ = local_inputs
    old = context.read_bytes()
    mapping.write_bytes(mapping.read_bytes().replace(b"65", b"66", 1))
    with pytest.raises(ValueError, match="previously registered bytes"):
        repair.rebind(root / "new-context", "test", apply=True)
    assert context.read_bytes() == old and not (root / "new-context").exists()


@pytest.mark.parametrize("damage", ["value", "label", "feature", "missing_nonzero", "source_hash", "unit"])
def test_changed_published_matrix_is_not_recertified(local_inputs, damage):
    root, context, _, _, db = local_inputs
    old = context.read_bytes()
    with sqlite3.connect(db) as conn:
        if damage == "value":
            conn.execute("UPDATE revision_species_abundance SET abundance=abundance+0.01 WHERE taxon_id=1")
            conn.execute("UPDATE revision_species_abundance SET abundance=abundance-0.01 WHERE taxon_id=2")
        if damage == "label":
            conn.execute("UPDATE revision_sample_info SET phenotype=CASE phenotype WHEN 'AD' THEN 'NC' ELSE 'AD' END")
        if damage == "feature":
            conn.execute("DELETE FROM revision_species_abundance WHERE taxon_id=2")
        if damage == "missing_nonzero":
            conn.execute("DELETE FROM revision_species_abundance WHERE sample_id=1 AND taxon_id=1")
        if damage == "source_hash":
            conn.execute("UPDATE dataset_revisions SET source_sha256='changed'")
        if damage == "unit":
            conn.execute("UPDATE dataset_revisions SET abundance_scale='unknown'")
    with pytest.raises(ValueError):
        repair.rebind(root / "new-context", "test", apply=True)
    assert context.read_bytes() == old and not (root / "new-context").exists()


def test_sparse_database_zero_requires_an_explicit_zero_in_the_original_source(local_inputs):
    root, _, _, source, db = local_inputs
    source.write_bytes(source.read_bytes().replace(b"25\t30\t10\t5", b"0\t30\t10\t5")
                       .replace(b"75\t70\t90\t95", b"100\t70\t90\t95"))
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE dataset_revisions SET source_sha256=?", (hashlib.sha256(source.read_bytes()).hexdigest(),))
        # CRR1 is third in the source's explicitly keyed metadata order.
        conn.execute("DELETE FROM revision_species_abundance WHERE sample_id=3 AND taxon_id=1")
        conn.execute("UPDATE revision_species_abundance SET abundance=1 WHERE sample_id=3 AND taxon_id=2")
    result = repair.rebind(root / "new-context", "test")
    assert result["comparedAbundanceCells"] == 8 and result["publishedObservations"] == 7
    assert result["verifiedImplicitSourceZeros"] == 1


def test_new_context_cannot_be_used_for_another_fixed_revision(local_inputs):
    root, context, _, _, _ = local_inputs
    repair.rebind(root / "new-context", "test", apply=True)
    current = json.loads(context.read_bytes())
    current["sourceRevision"] = "another-fixed-species"
    context.write_text(json.dumps(current))
    with pytest.raises(ValueError, match="another published revision"):
        primary.snapshot(dataset_slug="test")
