from __future__ import annotations

import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from app.core.database import connect, database_url, utcnow
from app.services.mag_data_service import MagDataError, MagDataset


class MagDatabaseError(RuntimeError):
    pass


def _json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _chunks(rows: Iterable[tuple], size: int = 5000):
    batch: list[tuple] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _manifest_sha256(data: MagDataset) -> str:
    return next(
        (source["sha256"] for source in data.sources if source["file"].endswith("_manifest.json")),
        "",
    )


def _expected_counts(data: MagDataset) -> dict[str, int]:
    return {
        "packageFiles": len(data.sources),
        "samples": len(data.samples),
        "representatives": len(data.mag_ids),
        "abundances": len(data.samples) * len(data.mag_ids),
        "taxonomy": len(data.taxonomy),
        "quality": len(data.quality),
        "clusters": len({row["clusterId"] for row in data.lineage}),
        "clusterMembers": len(data.lineage),
        "crosswalk": len(data.crosswalk),
    }


def _database_counts(conn, version_id: int) -> dict[str, int]:
    direct_tables = {
        "packageFiles": "mag_package_files",
        "samples": "mag_samples",
        "representatives": "mag_representatives",
        "abundances": "mag_abundances",
        "clusters": "mag_clusters",
        "clusterMembers": "mag_cluster_members",
        "crosswalk": "mag_species_crosswalk",
    }
    counts = {
        label: int(
            conn.execute(
                f"SELECT COUNT(*) AS value FROM {table} WHERE dataset_version_id = ?",  # noqa: S608
                (version_id,),
            ).fetchone()["value"]
        )
        for label, table in direct_tables.items()
    }
    for label, table in (("taxonomy", "mag_taxonomy"), ("quality", "mag_quality")):
        counts[label] = int(
            conn.execute(
                f"""
                SELECT COUNT(*) AS value
                FROM {table} detail
                JOIN mag_representatives rep ON rep.id = detail.representative_id
                WHERE rep.dataset_version_id = ?
                """,  # noqa: S608
                (version_id,),
            ).fetchone()["value"]
        )
    return counts


def import_mag_dataset(data: MagDataset) -> dict[str, Any]:
    """Import one validated package version without overwriting existing evidence."""

    expected = _expected_counts(data)
    with connect() as conn:
        existing = conn.execute(
            "SELECT id, data_fingerprint, status FROM mag_dataset_versions WHERE version_key = ?",
            (data.version,),
        ).fetchone()
        if existing is not None:
            if existing["data_fingerprint"] != data.fingerprint:
                raise MagDatabaseError(
                    f"数据库中的 {data.version} 指纹与数据包不一致；请建立新的 mag_vN，不能覆盖既有版本。"
                )
            counts = _database_counts(conn, int(existing["id"]))
            if existing["status"] != "ready" or counts != expected:
                raise MagDatabaseError(
                    f"数据库中的 {data.version} 不是完整 ready 快照：expected={expected}, actual={counts}"
                )
            return {
                "version": data.version,
                "versionId": int(existing["id"]),
                "fingerprint": data.fingerprint,
                "status": "ready",
                "unchanged": True,
                "counts": counts,
            }

        manifest = data.annotation_manifest or {}
        validation = {
            "sourceValidated": True,
            "storageContract": "mag-relational-v1",
            "counts": expected,
        }
        cursor = conn.execute(
            """
            INSERT INTO mag_dataset_versions (
              version_key, parent_version_key, status, source_root, data_fingerprint,
              manifest_sha256, manifest_json, sample_count, representative_mag_count,
              member_mag_count, cluster_count, unit, group_field, max_mapping_error,
              validation_json, imported_at
            ) VALUES (?, ?, 'importing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.version,
                str(manifest.get("parentVersion") or ""),
                str(data.root.resolve()),
                data.fingerprint,
                _manifest_sha256(data),
                json.dumps(manifest, ensure_ascii=False),
                len(data.samples),
                len(data.mag_ids),
                len(data.lineage),
                expected["clusters"],
                "%",
                "disease",
                data.max_mapping_error,
                json.dumps(validation, ensure_ascii=False),
                utcnow(),
            ),
        )
        version_id = int(cursor.lastrowid)

        prefix = f"development_input/{data.version}/"
        conn.executemany(
            """
            INSERT INTO mag_package_files (
              dataset_version_id, relative_path, sha256, size_bytes
            ) VALUES (?, ?, ?, ?)
            """,
            [
                (
                    version_id,
                    source["file"].removeprefix(prefix),
                    source["sha256"],
                    source["bytes"],
                )
                for source in data.sources
            ],
        )

        conn.executemany(
            """
            INSERT INTO mag_samples (
              dataset_version_id, position, sample_code, sample_name, accession,
              disease, source_group, hpc_batch, age, gender, mapped_percent,
              unmapped_percent, r1_uri, r2_uri, coverm_label
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    version_id,
                    position,
                    sample["sampleId"],
                    sample.get("sampleName", ""),
                    sample.get("accession", ""),
                    sample["disease"],
                    sample.get("sourceGroup", ""),
                    sample["batch"],
                    sample["age"],
                    sample["gender"],
                    sample["mappedPercent"],
                    sample["unmappedPercent"],
                    sample.get("r1Uri", ""),
                    sample.get("r2Uri", ""),
                    sample.get("covermLabel", ""),
                )
                for position, sample in enumerate(data.samples)
            ],
        )
        sample_ids = {
            row["sample_code"]: int(row["id"])
            for row in conn.execute(
                "SELECT id, sample_code FROM mag_samples WHERE dataset_version_id = ?",
                (version_id,),
            ).fetchall()
        }

        conn.executemany(
            """
            INSERT INTO mag_representatives (
              dataset_version_id, position, mag_code, length_bp
            ) VALUES (?, ?, ?, ?)
            """,
            [
                (version_id, position, mag_code, data.lengths[position])
                for position, mag_code in enumerate(data.mag_ids)
            ],
        )
        representative_ids = {
            row["mag_code"]: int(row["id"])
            for row in conn.execute(
                "SELECT id, mag_code FROM mag_representatives WHERE dataset_version_id = ?",
                (version_id,),
            ).fetchall()
        }

        for batch in _chunks(
            (
                (
                    version_id,
                    sample_ids[sample_code],
                    representative_ids[mag_code],
                    float(data.matrix[sample_position, mag_position]),
                )
                for sample_position, sample_code in enumerate(data.sample_ids)
                for mag_position, mag_code in enumerate(data.mag_ids)
            )
        ):
            conn.executemany(
                """
                INSERT INTO mag_abundances (
                  dataset_version_id, sample_id, representative_id, abundance_percent
                ) VALUES (?, ?, ?, ?)
                """,
                batch,
            )

        if data.taxonomy:
            conn.executemany(
                """
                INSERT INTO mag_taxonomy (
                  representative_id, domain, phylum, class, tax_order, family,
                  genus, species, classification_method, closest_reference,
                  closest_ani, closest_af, msa_percent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        representative_ids[row["magId"]],
                        row["domain"],
                        row["phylum"],
                        row["class"],
                        row["order"],
                        row["family"],
                        row["genus"],
                        row["species"],
                        row["classificationMethod"],
                        row["closestReference"],
                        row["closestAni"],
                        row["closestAf"],
                        row["msaPercent"],
                    )
                    for row in data.taxonomy
                ],
            )

        if data.quality:
            conn.executemany(
                """
                INSERT INTO mag_quality (
                  representative_id, completeness_percent, contamination_percent,
                  completeness_model, coding_density, contig_n50_bp, genome_size_bp,
                  gc_content, total_coding_sequences, total_contigs, max_contig_length_bp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        representative_ids[row["magId"]],
                        row["completenessPercent"],
                        row["contaminationPercent"],
                        row["completenessModel"],
                        row["codingDensity"],
                        row["contigN50Bp"],
                        row["genomeSizeBp"],
                        row["gcContent"],
                        row["totalCodingSequences"],
                        row["totalContigs"],
                        row["maxContigLengthBp"],
                    )
                    for row in data.quality
                ],
            )

        by_cluster: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in data.lineage:
            by_cluster[row["clusterId"]].append(row)
        if by_cluster:
            conn.executemany(
                """
                INSERT INTO mag_clusters (
                  dataset_version_id, cluster_code, representative_id,
                  representative_source_sample_id, member_count,
                  representative_completeness_percent,
                  representative_contamination_percent, representative_score,
                  secondary_cluster_distance_threshold, equivalent_ani_threshold,
                  cluster_method, comparison_algorithm, primary_cluster
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        version_id,
                        cluster_code,
                        representative_ids[rows[0]["representativeMag"]],
                        sample_ids[rows[0]["representativeSourceSampleId"]],
                        len(rows),
                        rows[0]["representativeCompletenessPercent"],
                        rows[0]["representativeContaminationPercent"],
                        rows[0]["representativeScore"],
                        rows[0]["secondaryClusterDistanceThreshold"],
                        rows[0]["equivalentAniThreshold"],
                        rows[0]["clusterMethod"],
                        rows[0]["comparisonAlgorithm"],
                        rows[0]["primaryCluster"],
                    )
                    for cluster_code, rows in by_cluster.items()
                ],
            )
            cluster_ids = {
                row["cluster_code"]: int(row["id"])
                for row in conn.execute(
                    "SELECT id, cluster_code FROM mag_clusters WHERE dataset_version_id = ?",
                    (version_id,),
                ).fetchall()
            }
            conn.executemany(
                """
                INSERT INTO mag_cluster_members (
                  dataset_version_id, cluster_id, member_mag_code, source_sample_id,
                  is_representative, member_to_rep_ani,
                  member_to_rep_alignment_coverage, ani_direction,
                  completeness_percent, contamination_percent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        version_id,
                        cluster_ids[row["clusterId"]],
                        row["memberMag"],
                        sample_ids[row["memberSourceSampleId"]],
                        row["isRepresentative"],
                        row["memberToRepAni"],
                        row["memberToRepAlignmentCoverage"],
                        row["aniDirection"],
                        row["memberCompletenessPercent"],
                        row["memberContaminationPercent"],
                    )
                    for row in data.lineage
                ],
            )

        if data.crosswalk:
            conn.executemany(
                """
                INSERT INTO mag_species_crosswalk (
                  representative_id, dataset_version_id, gtdb_species,
                  gtdb_classification, gtdb_reference_accession,
                  gtdb_reference_source_field, gtdb_reference_ani,
                  gtdb_reference_af, gtdb_classification_method,
                  reference_ncbi_taxid, ncbi_species_taxid, ncbi_organism_name,
                  ncbi_taxonomy, kraken_species_id, kraken_species_name,
                  kraken_mpa_species_label, mapping_method, mapping_level,
                  mapping_confidence, mapping_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        representative_ids[row["magId"]],
                        version_id,
                        row["gtdbSpecies"],
                        row["gtdbClassification"],
                        row["gtdbReferenceAccession"],
                        row["gtdbReferenceSourceField"],
                        row["gtdbReferenceAni"],
                        row["gtdbReferenceAf"],
                        row["gtdbClassificationMethod"],
                        row["referenceNcbiTaxid"],
                        row["ncbiSpeciesTaxid"],
                        row["ncbiOrganismName"],
                        row["ncbiTaxonomy"],
                        row["krakenSpeciesId"],
                        row["krakenSpeciesName"],
                        row["krakenMpaSpeciesLabel"],
                        row["mappingMethod"],
                        row["mappingLevel"],
                        row["mappingConfidence"],
                        row["mappingStatus"],
                    )
                    for row in data.crosswalk
                ],
            )

        actual = _database_counts(conn, version_id)
        if actual != expected:
            raise MagDatabaseError(
                f"MAG 数据库导入计数不一致：expected={expected}, actual={actual}"
            )
        conn.execute(
            "UPDATE mag_dataset_versions SET status = 'ready' WHERE id = ?",
            (version_id,),
        )

    clear_mag_database_cache()
    return {
        "version": data.version,
        "versionId": version_id,
        "fingerprint": data.fingerprint,
        "status": "ready",
        "unchanged": False,
        "counts": actual,
    }


def load_mag_dataset_from_database(version: str) -> MagDataset:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, version_key, status, source_root, data_fingerprint,
                   manifest_json, max_mapping_error
            FROM mag_dataset_versions
            WHERE version_key = ?
            """,
            (version,),
        ).fetchone()
    if row is None:
        raise MagDataError(".", f"MySQL 中存在已导入的 {version}", "未找到", version)
    if row["status"] != "ready":
        raise MagDataError(".", f"MySQL 中 {version} 状态为 ready", row["status"], version)
    database_key = database_url().render_as_string(hide_password=True)
    serialized_manifest = (
        row["manifest_json"]
        if isinstance(row["manifest_json"], str)
        else json.dumps(row["manifest_json"] or {}, ensure_ascii=False, sort_keys=True)
    )
    return _load_database_snapshot(
        database_key,
        int(row["id"]),
        row["version_key"],
        row["source_root"],
        row["data_fingerprint"],
        serialized_manifest,
        float(row["max_mapping_error"]),
    )


@lru_cache(maxsize=4)
def _load_database_snapshot(
    database_key: str,
    version_id: int,
    version: str,
    source_root: str,
    fingerprint: str,
    manifest_json: Any,
    max_mapping_error: float,
) -> MagDataset:
    del database_key
    with connect() as conn:
        source_rows = conn.execute(
            """
            SELECT relative_path, sha256, size_bytes
            FROM mag_package_files
            WHERE dataset_version_id = ?
            ORDER BY relative_path
            """,
            (version_id,),
        ).fetchall()
        sample_rows = conn.execute(
            "SELECT * FROM mag_samples WHERE dataset_version_id = ? ORDER BY position",
            (version_id,),
        ).fetchall()
        representative_rows = conn.execute(
            "SELECT * FROM mag_representatives WHERE dataset_version_id = ? ORDER BY position",
            (version_id,),
        ).fetchall()
        abundance_rows = conn.execute(
            """
            SELECT sample.position AS sample_position,
                   representative.position AS representative_position,
                   abundance.abundance_percent
            FROM mag_abundances abundance
            JOIN mag_samples sample ON sample.id = abundance.sample_id
            JOIN mag_representatives representative
              ON representative.id = abundance.representative_id
            WHERE abundance.dataset_version_id = ?
            ORDER BY sample.position, representative.position
            """,
            (version_id,),
        ).fetchall()
        taxonomy_rows = conn.execute(
            """
            SELECT representative.mag_code, taxonomy.*
            FROM mag_taxonomy taxonomy
            JOIN mag_representatives representative
              ON representative.id = taxonomy.representative_id
            WHERE representative.dataset_version_id = ?
            ORDER BY representative.position
            """,
            (version_id,),
        ).fetchall()
        quality_rows = conn.execute(
            """
            SELECT representative.mag_code, quality.*
            FROM mag_quality quality
            JOIN mag_representatives representative
              ON representative.id = quality.representative_id
            WHERE representative.dataset_version_id = ?
            ORDER BY representative.position
            """,
            (version_id,),
        ).fetchall()
        lineage_rows = conn.execute(
            """
            SELECT cluster.cluster_code, cluster.member_count,
                   representative.mag_code AS representative_mag,
                   representative_sample.sample_code AS representative_sample_code,
                   representative_sample.sample_name AS representative_sample_name,
                   representative_sample.accession AS representative_accession,
                   representative_sample.disease AS representative_disease,
                   representative_sample.source_group AS representative_group,
                   representative_sample.hpc_batch AS representative_batch,
                   member.member_mag_code, member.is_representative,
                   member_sample.sample_code AS member_sample_code,
                   member_sample.sample_name AS member_sample_name,
                   member_sample.accession AS member_accession,
                   member_sample.disease AS member_disease,
                   member_sample.source_group AS member_group,
                   member_sample.hpc_batch AS member_batch,
                   member.member_to_rep_ani, member.member_to_rep_alignment_coverage,
                   member.ani_direction, member.completeness_percent,
                   member.contamination_percent,
                   cluster.representative_completeness_percent,
                   cluster.representative_contamination_percent,
                   cluster.representative_score,
                   cluster.secondary_cluster_distance_threshold,
                   cluster.equivalent_ani_threshold, cluster.cluster_method,
                   cluster.comparison_algorithm, cluster.primary_cluster
            FROM mag_cluster_members member
            JOIN mag_clusters cluster ON cluster.id = member.cluster_id
            JOIN mag_representatives representative
              ON representative.id = cluster.representative_id
            JOIN mag_samples representative_sample
              ON representative_sample.id = cluster.representative_source_sample_id
            JOIN mag_samples member_sample ON member_sample.id = member.source_sample_id
            WHERE member.dataset_version_id = ?
            ORDER BY cluster.cluster_code, member.member_mag_code
            """,
            (version_id,),
        ).fetchall()
        crosswalk_rows = conn.execute(
            """
            SELECT representative.mag_code, crosswalk.*
            FROM mag_species_crosswalk crosswalk
            JOIN mag_representatives representative
              ON representative.id = crosswalk.representative_id
            WHERE crosswalk.dataset_version_id = ?
            ORDER BY representative.position
            """,
            (version_id,),
        ).fetchall()

    sample_ids = tuple(row["sample_code"] for row in sample_rows)
    mag_ids = tuple(row["mag_code"] for row in representative_rows)
    matrix = np.full((len(sample_rows), len(representative_rows)), np.nan, dtype=float)
    for row in abundance_rows:
        matrix[int(row["sample_position"]), int(row["representative_position"])] = float(
            row["abundance_percent"]
        )
    if not np.isfinite(matrix).all():
        raise MagDataError(
            "mag_abundances",
            "完整 Sample × MAG 丰度矩阵",
            "存在缺失单元格",
            version,
        )
    matrix.setflags(write=False)

    samples = tuple(
        {
            "sampleId": row["sample_code"],
            "disease": row["disease"],
            "age": float(row["age"]),
            "gender": row["gender"],
            "batch": row["hpc_batch"],
            "mappedPercent": float(row["mapped_percent"]),
            "unmappedPercent": float(row["unmapped_percent"]),
            "sampleName": row["sample_name"],
            "accession": row["accession"],
            "sourceGroup": row["source_group"],
            "r1Uri": row["r1_uri"],
            "r2Uri": row["r2_uri"],
            "covermLabel": row["coverm_label"],
        }
        for row in sample_rows
    )
    taxonomy = tuple(
        {
            "magId": row["mag_code"],
            "domain": row["domain"],
            "phylum": row["phylum"],
            "class": row["class"],
            "order": row["tax_order"],
            "family": row["family"],
            "genus": row["genus"],
            "species": row["species"],
            "classificationMethod": row["classification_method"],
            "closestReference": row["closest_reference"],
            "closestAni": float(row["closest_ani"]) if row["closest_ani"] is not None else None,
            "closestAf": float(row["closest_af"]) if row["closest_af"] is not None else None,
            "msaPercent": float(row["msa_percent"]) if row["msa_percent"] is not None else None,
        }
        for row in taxonomy_rows
    )
    quality = tuple(
        {
            "magId": row["mag_code"],
            "completenessPercent": float(row["completeness_percent"]),
            "contaminationPercent": float(row["contamination_percent"]),
            "completenessModel": row["completeness_model"],
            "codingDensity": float(row["coding_density"]),
            "contigN50Bp": int(row["contig_n50_bp"]),
            "genomeSizeBp": int(row["genome_size_bp"]),
            "gcContent": float(row["gc_content"]),
            "totalCodingSequences": int(row["total_coding_sequences"]),
            "totalContigs": int(row["total_contigs"]),
            "maxContigLengthBp": int(row["max_contig_length_bp"]),
            "inReferenceBand": bool(
                float(row["completeness_percent"]) >= 90
                and float(row["contamination_percent"]) <= 5
            ),
        }
        for row in quality_rows
    )
    lineage = tuple(
        {
            "clusterId": row["cluster_code"],
            "representativeMag": row["representative_mag"],
            "memberMag": row["member_mag_code"],
            "isRepresentative": bool(row["is_representative"]),
            "clusterMemberCount": int(row["member_count"]),
            "representativeSourceSampleId": row["representative_sample_code"],
            "representativeSampleName": row["representative_sample_name"],
            "representativeSampleAccession": row["representative_accession"],
            "representativeDisease": row["representative_disease"],
            "representativeGroup": row["representative_group"],
            "representativeHpcBatch": row["representative_batch"],
            "memberSourceSampleId": row["member_sample_code"],
            "memberSampleName": row["member_sample_name"],
            "memberSampleAccession": row["member_accession"],
            "memberDisease": row["member_disease"],
            "memberGroup": row["member_group"],
            "memberHpcBatch": row["member_batch"],
            "memberToRepAni": float(row["member_to_rep_ani"]),
            "memberToRepAlignmentCoverage": float(row["member_to_rep_alignment_coverage"]),
            "aniDirection": row["ani_direction"],
            "memberCompletenessPercent": float(row["completeness_percent"]),
            "memberContaminationPercent": float(row["contamination_percent"]),
            "representativeCompletenessPercent": float(row["representative_completeness_percent"]),
            "representativeContaminationPercent": float(row["representative_contamination_percent"]),
            "representativeScore": float(row["representative_score"]),
            "secondaryClusterDistanceThreshold": float(row["secondary_cluster_distance_threshold"]),
            "equivalentAniThreshold": float(row["equivalent_ani_threshold"]),
            "clusterMethod": row["cluster_method"],
            "comparisonAlgorithm": row["comparison_algorithm"],
            "primaryCluster": row["primary_cluster"],
        }
        for row in lineage_rows
    )
    crosswalk = tuple(
        {
            "magId": row["mag_code"],
            "gtdbSpecies": row["gtdb_species"],
            "gtdbClassification": row["gtdb_classification"],
            "gtdbReferenceAccession": row["gtdb_reference_accession"],
            "gtdbReferenceSourceField": row["gtdb_reference_source_field"],
            "gtdbReferenceAni": float(row["gtdb_reference_ani"]) if row["gtdb_reference_ani"] is not None else None,
            "gtdbReferenceAf": float(row["gtdb_reference_af"]) if row["gtdb_reference_af"] is not None else None,
            "gtdbClassificationMethod": row["gtdb_classification_method"],
            "referenceNcbiTaxid": row["reference_ncbi_taxid"],
            "ncbiSpeciesTaxid": row["ncbi_species_taxid"],
            "ncbiOrganismName": row["ncbi_organism_name"],
            "ncbiTaxonomy": row["ncbi_taxonomy"],
            "krakenSpeciesId": row["kraken_species_id"],
            "krakenSpeciesName": row["kraken_species_name"],
            "krakenMpaSpeciesLabel": row["kraken_mpa_species_label"],
            "mappingMethod": row["mapping_method"],
            "mappingLevel": row["mapping_level"],
            "mappingConfidence": row["mapping_confidence"],
            "mappingStatus": row["mapping_status"],
        }
        for row in crosswalk_rows
    )
    sources = tuple(
        {
            "file": f"development_input/{version}/{row['relative_path']}",
            "sha256": row["sha256"],
            "bytes": int(row["size_bytes"]),
        }
        for row in source_rows
    )
    return MagDataset(
        Path(source_root),
        version,
        sample_ids,
        mag_ids,
        matrix,
        samples,
        tuple(int(row["length_bp"]) for row in representative_rows),
        fingerprint,
        sources,
        max_mapping_error,
        taxonomy,
        quality,
        _json_value(manifest_json, {}),
        lineage,
        crosswalk,
        "database",
    )


def clear_mag_database_cache() -> None:
    _load_database_snapshot.cache_clear()
