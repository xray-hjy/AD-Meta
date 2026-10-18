from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from threading import Barrier
from time import sleep
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.core import database
from app.core.migrations import upgrade_database
from app.services import mag_database_service as mag_database
from app.services.mag_data_service import MagDataset
from app.services.mag_database_service import (
    MagDatabaseError,
    import_mag_dataset,
    load_mag_dataset_from_database,
)


def sample_dataset(root: Path, fingerprint: str = "a" * 64) -> MagDataset:
    matrix = np.asarray([[1.25, 2.5], [3.75, 4.0]], dtype=float)
    matrix.setflags(write=False)
    samples = (
        {
            "sampleId": "CRR1", "disease": "NC", "age": 65.0, "gender": "F", "batch": "1",
            "mappedPercent": 3.75, "unmappedPercent": 96.25, "sampleName": "S1",
            "accession": "SAMC1", "sourceGroup": "CHN", "r1Uri": "/reads/1_R1.fastq.gz",
            "r2Uri": "/reads/1_R2.fastq.gz", "covermLabel": "CRR1_R1.fastq.gz",
        },
        {
            "sampleId": "CRR2", "disease": "AD", "age": 72.0, "gender": "M", "batch": "2",
            "mappedPercent": 7.75, "unmappedPercent": 92.25, "sampleName": "S2",
            "accession": "SAMC2", "sourceGroup": "CHN2", "r1Uri": "/reads/2_R1.fastq.gz",
            "r2Uri": "/reads/2_R2.fastq.gz", "covermLabel": "CRR2_R1.fastq.gz",
        },
    )
    taxonomy = tuple(
        {
            "magId": mag_id, "domain": "Bacteria", "phylum": "Bacillota", "class": "Clostridia",
            "order": "Lachnospirales", "family": "Lachnospiraceae", "genus": genus,
            "species": species, "classificationMethod": "ANI and topology",
            "closestReference": reference, "closestAni": ani, "closestAf": 0.8, "msaPercent": 95.0,
        }
        for mag_id, genus, species, reference, ani in (
            ("MAG_A", "GenusA", "Species A", "GCA_1", 97.0),
            ("MAG_B", "GenusB", "Species B", "GCA_2", 98.0),
        )
    )
    quality = tuple(
        {
            "magId": mag_id, "completenessPercent": completeness, "contaminationPercent": contamination,
            "completenessModel": "Neural Network", "codingDensity": 0.9, "contigN50Bp": 500,
            "genomeSizeBp": length, "gcContent": 0.5, "totalCodingSequences": 100,
            "totalContigs": 10, "maxContigLengthBp": 700,
            "inReferenceBand": completeness >= 90 and contamination <= 5,
        }
        for mag_id, length, completeness, contamination in (
            ("MAG_A", 1000, 95.0, 2.0),
            ("MAG_B", 2000, 92.0, 3.0),
        )
    )

    def lineage_row(
        cluster: str,
        representative: str,
        member: str,
        sample: dict,
        is_representative: bool,
        member_count: int,
        ani: float,
    ) -> dict:
        representative_sample = samples[0] if representative == "MAG_A" else samples[1]
        return {
            "clusterId": cluster, "representativeMag": representative, "memberMag": member,
            "isRepresentative": is_representative, "clusterMemberCount": member_count,
            "representativeSourceSampleId": representative_sample["sampleId"],
            "representativeSampleName": representative_sample["sampleName"],
            "representativeSampleAccession": representative_sample["accession"],
            "representativeDisease": representative_sample["disease"],
            "representativeGroup": representative_sample["sourceGroup"],
            "representativeHpcBatch": representative_sample["batch"],
            "memberSourceSampleId": sample["sampleId"], "memberSampleName": sample["sampleName"],
            "memberSampleAccession": sample["accession"], "memberDisease": sample["disease"],
            "memberGroup": sample["sourceGroup"], "memberHpcBatch": sample["batch"],
            "memberToRepAni": ani, "memberToRepAlignmentCoverage": 0.8,
            "aniDirection": "representative_reference__member_query",
            "memberCompletenessPercent": 90.0, "memberContaminationPercent": 2.0,
            "representativeCompletenessPercent": 95.0, "representativeContaminationPercent": 2.0,
            "representativeScore": 85.0, "secondaryClusterDistanceThreshold": 0.05,
            "equivalentAniThreshold": 0.95, "clusterMethod": "average",
            "comparisonAlgorithm": "fastANI", "primaryCluster": cluster.removeprefix("c"),
        }

    lineage = (
        lineage_row("c1", "MAG_A", "MAG_A", samples[0], True, 2, 1.0),
        lineage_row("c1", "MAG_A", "MEMBER_X", samples[1], False, 2, 0.949),
        lineage_row("c2", "MAG_B", "MAG_B", samples[1], True, 1, 1.0),
    )
    crosswalk = tuple(
        {
            "magId": mag_id, "gtdbSpecies": species, "gtdbClassification": f"d__Bacteria;s__{species}",
            "gtdbReferenceAccession": reference, "gtdbReferenceSourceField": "closest_genome_reference",
            "gtdbReferenceAni": ani, "gtdbReferenceAf": 0.8,
            "gtdbClassificationMethod": "ANI and topology", "referenceNcbiTaxid": taxid,
            "ncbiSpeciesTaxid": taxid, "ncbiOrganismName": species,
            "ncbiTaxonomy": f"d__Bacteria;s__{species}", "krakenSpeciesId": taxid,
            "krakenSpeciesName": species, "krakenMpaSpeciesLabel": f"s__{species}",
            "mappingMethod": "taxid", "mappingLevel": "species", "mappingConfidence": "exact",
            "mappingStatus": "matched_exact_ncbi_species_taxid",
        }
        for mag_id, species, reference, ani, taxid in (
            ("MAG_A", "Species A", "GCA_1", 97.0, "101"),
            ("MAG_B", "Species B", "GCA_2", 98.0, "102"),
        )
    )
    manifest = {
        "version": "mag_v3", "parentVersion": "mag_v2", "sampleCount": 2,
        "representativeMagCount": 2, "memberMagCount": 3, "secondaryClusterCount": 2,
    }
    return MagDataset(
        root,
        "mag_v3",
        ("CRR1", "CRR2"),
        ("MAG_A", "MAG_B"),
        matrix,
        samples,
        (1000, 2000),
        fingerprint,
        (
            {
                "file": "development_input/mag_v3/provenance/mag_v3_manifest.json",
                "sha256": "b" * 64,
                "bytes": 100,
            },
            {
                "file": "development_input/mag_v3/abundance/sample_mag_relative_abundance.tsv",
                "sha256": "c" * 64,
                "bytes": 200,
            },
        ),
        0.0,
        taxonomy,
        quality,
        manifest,
        lineage,
        crosswalk,
    )


def test_mag_database_roundtrip_is_complete_and_idempotent(tmp_path) -> None:
    db_path = tmp_path / "mag.sqlite3"
    package_root = tmp_path / "development_input" / "mag_v3"
    package_root.mkdir(parents=True)
    data = sample_dataset(package_root)

    database.dispose_engine()
    try:
        with patch.object(database, "DB_ENGINE", "sqlite"), patch.object(database, "DB_PATH", db_path):
            upgrade_database()
            imported = import_mag_dataset(data)
            loaded = load_mag_dataset_from_database("mag_v3")
            repeated = import_mag_dataset(data)

            assert imported["unchanged"] is False
            assert imported["counts"] == {
                "packageFiles": 2, "samples": 2, "representatives": 2, "abundances": 4,
                "taxonomy": 2, "quality": 2, "clusters": 2, "clusterMembers": 3, "crosswalk": 2,
            }
            assert repeated["unchanged"] is True
            assert loaded.storage_backend == "database"
            assert loaded.fingerprint == data.fingerprint
            assert loaded.sample_ids == data.sample_ids
            assert loaded.mag_ids == data.mag_ids
            np.testing.assert_allclose(loaded.matrix, data.matrix)
            assert loaded.samples == data.samples
            assert loaded.taxonomy == data.taxonomy
            assert loaded.quality == data.quality
            assert {row["memberMag"] for row in loaded.lineage} == {"MAG_A", "MAG_B", "MEMBER_X"}
            assert loaded.crosswalk == data.crosswalk

            with pytest.raises(MagDatabaseError, match="不能覆盖"):
                import_mag_dataset(sample_dataset(package_root, fingerprint="d" * 64))
    finally:
        database.dispose_engine()


def test_concurrent_cold_mag_requests_share_one_snapshot(tmp_path) -> None:
    expected = sample_dataset(tmp_path)
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = {
        "id": 1, "version_key": "mag_v3", "status": "ready", "source_root": str(tmp_path),
        "data_fingerprint": expected.fingerprint, "manifest_json": {}, "max_mapping_error": 0,
    }
    context = MagicMock()
    context.__enter__.return_value = connection
    builds = []

    @lru_cache(maxsize=4)
    def slow_snapshot(*args):
        builds.append(args)
        sleep(0.05)  # Simulate database decoding while another request reaches the same cold key.
        return expected

    ready = Barrier(4)

    def load(_):
        ready.wait(timeout=5)
        return load_mag_dataset_from_database("mag_v3")

    with (
        patch.object(mag_database, "connect", return_value=context),
        patch.object(mag_database, "_load_database_snapshot", slow_snapshot),
        ThreadPoolExecutor(max_workers=4) as pool,
    ):
        results = list(pool.map(load, range(4)))

    assert len(builds) == 1
    assert all(result is expected for result in results)
    assert slow_snapshot.cache_info().hits == 3
