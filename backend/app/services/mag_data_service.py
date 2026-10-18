"""Read-only, fail-closed adapter for versioned MAG analysis packages.

This is deliberately separate from taxonomy/KO revision tables: CoverM percent
values must not be renormalized, and annotations are accepted only from a
validated MAG-ID keyed package.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg
from app.core.config import BACKEND_ROOT, SETTINGS
from app.services.csv_export import SpreadsheetSafeDictWriter

DEFAULT_VERSION = "mag_v2"
ANALYSIS_VERSION = "mag-exploration-v2"
MAPPING_TOLERANCE = 0.001  # percentage points; serialized CoverM rounding only
MATRIX = "abundance/sample_mag_relative_abundance.tsv"
MANIFEST = "abundance/sample_manifest.tsv"
LENGTHS = "abundance/mag_length.tsv"
MAPPING = "abundance/sample_coverm_mapping_summary.tsv"
METADATA = "metadata/metadata_NC_AD.csv"
TAXONOMY = "annotations/mag_taxonomy.tsv"
QUALITY = "quality/mag_quality.tsv"
V2_MANIFEST = "provenance/mag_v2_manifest.json"
V3_MANIFEST = "provenance/mag_v3_manifest.json"
ANNOTATION_MANIFEST = V2_MANIFEST  # Backward-compatible public name used by mag_v2 tooling/tests.
LINEAGE = "provenance/mag_representative_lineage.tsv"
CROSSWALK = "annotations/species_taxonomy_crosswalk.tsv"
PACKAGE_README = "README.md"
INTEGRATION_PLAN = "INTEGRATION_PLAN.md"
QA_REPORT = "provenance/qa_report.md"
CORE_FILES = (MATRIX, MANIFEST, LENGTHS, MAPPING, METADATA)
ANNOTATION_FILES = (TAXONOMY, QUALITY, V2_MANIFEST)
V3_FILES = (
    *CORE_FILES,
    TAXONOMY,
    QUALITY,
    CROSSWALK,
    LINEAGE,
    PACKAGE_README,
    INTEGRATION_PLAN,
    QA_REPORT,
    V3_MANIFEST,
)
FILES = CORE_FILES  # Backward-compatible name for the mag_v1 core contract.
UPSTREAM_GENERATION = {
    "mag_v1": {
        "tool": "CoverM",
        "toolVersion": "0.8.0",
        "mapper": "strobealign",
        "genomeInputMode": "--genome-fasta-list",
        "minimumCoveredFraction": 0,
        "outputFormat": "dense",
        "bamCaching": "disabled",
        "methods": ["mean", "relative_abundance", "covered_fraction", "variance", "count", "reads_per_base", "length"],
        "basis": "ADMetaData mag_v1 delivery documentation dated 2026-08-30",
    },
    "mag_v2": {
        "tool": "CoverM",
        "toolVersion": "0.8.0",
        "mapper": "strobealign",
        "genomeInputMode": "--genome-fasta-list",
        "minimumCoveredFraction": 0,
        "outputFormat": "dense",
        "bamCaching": "disabled",
        "methods": ["mean", "relative_abundance", "covered_fraction", "variance", "count", "reads_per_base", "length"],
        "basis": "mag_v2 inherits the validated mag_v1 CoverM abundance inputs without renormalization",
    },
}
HEADERS = {
    MANIFEST: ["Sample", "R1", "R2", "CoverMLabel"],
    LENGTHS: ["MAG", "length_bp"],
    MAPPING: ["Sample", "Unmapped_relative_abundance_percent", "Mapped_to_872_MAGs_percent"],
    METADATA: ["sample_id", "Sample_name", "Accession", "disease", "HPC_Batch", "Group", "Age", "Gender"],
    TAXONOMY: ["MAG", "domain", "phylum", "class", "order", "family", "genus", "species",
               "classification_method", "closest_reference", "closest_ani", "closest_af", "msa_percent"],
    QUALITY: ["MAG", "completeness_percent", "contamination_percent", "completeness_model", "coding_density",
              "contig_n50_bp", "genome_size_bp", "gc_content", "total_coding_sequences", "total_contigs",
              "max_contig_length_bp"],
    LINEAGE: [
        "cluster_id", "representative_mag", "member_mag", "is_representative", "cluster_member_count",
        "representative_source_sample_id", "representative_sample_name", "representative_sample_accession",
        "representative_disease", "representative_group", "representative_hpc_batch",
        "member_source_sample_id", "member_sample_name", "member_sample_accession", "member_disease",
        "member_group", "member_hpc_batch", "member_to_rep_ani", "member_to_rep_alignment_coverage",
        "ani_direction", "member_completeness_percent", "member_contamination_percent",
        "representative_completeness_percent", "representative_contamination_percent", "representative_score",
        "secondary_cluster_distance_threshold", "equivalent_ani_threshold", "cluster_method",
        "comparison_algorithm", "primary_cluster",
    ],
    CROSSWALK: [
        "MAG_ID", "gtdb_species", "gtdb_classification", "gtdb_reference_accession",
        "gtdb_reference_source_field", "gtdb_reference_ani", "gtdb_reference_af",
        "gtdb_classification_method", "reference_ncbi_taxid", "ncbi_species_taxid", "ncbi_organism_name",
        "ncbi_taxonomy", "kraken_species_id", "kraken_species_name", "kraken_mpa_species_label",
        "mapping_method", "mapping_level", "mapping_confidence", "mapping_status",
    ],
}
TAXONOMY_RANKS = ("domain", "phylum", "class", "order", "family", "genus", "species")
MAPPING_STATUSES = (
    "matched_exact_ncbi_species_taxid",
    "ncbi_species_taxid_not_observed_in_reads",
    "no_gtdb_reference",
)


class MagDataError(ValueError):
    def __init__(self, file: str, expected: str, actual: str, version: str = DEFAULT_VERSION):
        self.report = {
            "file": f"development_input/{version}/{file}",
            "expected": expected,
            "actual": actual,
            "impact": "MAG 数据已停用；不影响既有物种/KO 数据。",
            "reproduce": "npm run validate:mag",
            "remediation": "请交数据维护负责人核验；保留 source_data 与现有版本，新数据应建立并核验新的 mag_vN。",
        }
        super().__init__(f"MAG 数据校验失败：{file}；预期 {expected}；实际 {actual}。请运行 npm run validate:mag 并联系数据维护负责人。")


@dataclass(frozen=True)
class MagContract:
    samples: int = 185
    mags: int = 872
    ad: int = 122
    nc: int = 63
    members: int = 8548
    clusters: int = 872
    low_ani_members: int = 24
    crosswalk_exact: int = 266
    crosswalk_not_observed: int = 577
    crosswalk_unresolved: int = 29


@dataclass(frozen=True)
class MagScope:
    disease: str = ""
    gender: str = ""
    batch: str = ""
    age_min: float | None = None
    age_max: float | None = None
    abundance_threshold_percent: float = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "disease": self.disease, "gender": self.gender, "batch": self.batch,
            "ageMin": self.age_min, "ageMax": self.age_max,
            "abundanceThresholdPercent": self.abundance_threshold_percent,
        }


@dataclass(frozen=True, eq=False)
class MagDataset:
    root: Path
    version: str
    sample_ids: tuple[str, ...]
    mag_ids: tuple[str, ...]
    matrix: np.ndarray
    samples: tuple[dict[str, Any], ...]
    lengths: tuple[int, ...]
    fingerprint: str
    sources: tuple[dict[str, Any], ...]
    max_mapping_error: float
    taxonomy: tuple[dict[str, Any], ...]
    quality: tuple[dict[str, Any], ...]
    annotation_manifest: dict[str, Any] | None
    lineage: tuple[dict[str, Any], ...]
    crosswalk: tuple[dict[str, Any], ...]
    storage_backend: str = "package"


def _require(condition: bool, file: str, expected: str, actual: Any, version: str = DEFAULT_VERSION) -> None:
    if not condition:
        raise MagDataError(file, expected, str(actual), version)


def _version_files(version: str) -> tuple[str, ...]:
    version_number = int(version.removeprefix("mag_v"))
    if version_number >= 3:
        return V3_FILES
    return (*CORE_FILES, *ANNOTATION_FILES) if version_number >= 2 else CORE_FILES


def _manifest_file(version: str) -> str | None:
    version_number = int(version.removeprefix("mag_v"))
    if version_number >= 3:
        return V3_MANIFEST
    if version_number >= 2:
        return V2_MANIFEST
    return None


def _signatures(root: Path, version: str) -> tuple:
    result = []
    for name in _version_files(version):
        path = root / name
        try:
            # Do not follow package symlinks into source_data or outside this version.
            _require(path.resolve().is_relative_to(root.resolve()), name, f"位于 {version} 内的文件", "路径越界", version)
            stat = path.stat()
        except OSError as exc:
            raise MagDataError(name, "存在且可读", type(exc).__name__, version) from exc
        result.append((stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, stat.st_ino))
    return tuple(result)


DEFAULT_CONTRACT = MagContract()
_snapshot_load_lock = Lock()


def load_mag_dataset(
    package_root: Path | None = None,
    contract: MagContract = DEFAULT_CONTRACT,
    version: str | None = None,
    storage_backend: str | None = None,
) -> MagDataset:
    configured_version = version or SETTINGS.mag_data_version
    if not re.fullmatch(r"mag_v[1-9]\d*", configured_version):
        raise MagDataError(".", "版本名格式 mag_vN", configured_version, configured_version)
    selected_backend = storage_backend or SETTINGS.mag_storage_backend
    if package_root is None and selected_backend == "database":
        from app.services.mag_database_service import load_mag_dataset_from_database

        return load_mag_dataset_from_database(configured_version)
    configured = package_root if package_root is not None else SETTINGS.mag_data_root
    package = configured if configured.is_absolute() else BACKEND_ROOT.parent / configured
    root = package / "development_input" / configured_version
    with _snapshot_load_lock:
        return _load_snapshot(root, _signatures(root, configured_version), contract, configured_version)


@lru_cache(maxsize=2)
def _load_snapshot(root: Path, signatures: tuple, contract: MagContract, version: str) -> MagDataset:
    def require(condition: bool, file: str, expected: str, actual: Any) -> None:
        _require(condition, file, expected, actual, version)

    tables, headers, sources = {}, {}, []
    digest = hashlib.sha256()
    manifest_file = _manifest_file(version)
    annotation_manifest = None
    verified_content: dict[str, bytes] = {}
    if manifest_file:
        manifest_path = root / manifest_file
        try:
            manifest_content = manifest_path.read_bytes()
            annotation_manifest = json.loads(manifest_content.decode("utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise MagDataError(manifest_file, "可读取的 UTF-8 JSON", type(exc).__name__, version) from exc
        require(annotation_manifest.get("version") == version, manifest_file, f"version={version}", annotation_manifest.get("version"))
        manifest_mag_count = annotation_manifest.get("representativeMagCount", annotation_manifest.get("magCount"))
        require(manifest_mag_count == contract.mags, manifest_file, f"代表 MAG 数={contract.mags}", manifest_mag_count)
        manifest_hash = hashlib.sha256(manifest_content).hexdigest()
        digest.update(f"{manifest_file}\0{manifest_hash}\n".encode())
        sources.append({"file": f"development_input/{version}/{manifest_file}",
                        "sha256": manifest_hash, "bytes": len(manifest_content)})
        if version.startswith("mag_v") and int(version.removeprefix("mag_v")) >= 3:
            entries = annotation_manifest.get("files")
            require(isinstance(entries, list), manifest_file, "files 为包内文件清单", type(entries).__name__)
            expected_paths = set(_version_files(version)) - {manifest_file}
            actual_paths = {entry.get("path") for entry in entries if isinstance(entry, dict)}
            require(actual_paths == expected_paths, manifest_file, f"完整文件集合 {sorted(expected_paths)}", sorted(actual_paths))
            for entry in entries:
                name = entry["path"]
                path = root / name
                try:
                    require(path.resolve().is_relative_to(root.resolve()), name, f"位于 {version} 内的文件", "路径越界")
                    content = path.read_bytes()
                except OSError as exc:
                    raise MagDataError(name, "存在且可读", type(exc).__name__, version) from exc
                actual_hash = hashlib.sha256(content).hexdigest()
                require(len(content) == entry.get("bytes"), name, f"{entry.get('bytes')} bytes", len(content))
                require(actual_hash.casefold() == str(entry.get("sha256", "")).casefold(), name,
                        f"SHA-256 {entry.get('sha256')}", actual_hash)
                verified_content[name] = content
                digest.update(f"{name}\0{actual_hash}\n".encode())
                sources.append({"file": f"development_input/{version}/{name}",
                                "sha256": actual_hash, "bytes": len(content)})

    table_files = [*CORE_FILES]
    if int(version.removeprefix("mag_v")) >= 2:
        table_files.extend((TAXONOMY, QUALITY))
    if int(version.removeprefix("mag_v")) >= 3:
        table_files.extend((LINEAGE, CROSSWALK))
    for name in table_files:
        try:
            content = verified_content.get(name) or (root / name).read_bytes()
            reader = csv.reader(io.StringIO(content.decode("utf-8-sig")), delimiter="," if name == METADATA else "\t")
            header = next(reader)
            rows = list(reader)
        except (OSError, UnicodeError, csv.Error, StopIteration) as exc:
            raise MagDataError(name, "可读取的 UTF-8 表格", type(exc).__name__, version) from exc
        require(bool(header), name, "非空表头", "空表头")
        require(len(header) == len(set(header)), name, "唯一表头", "重复表头")
        if name == MATRIX:
            require(header[0] == "Sample" and len(header) == contract.mags + 1, name,
                    f"Sample + {contract.mags} 个 MAG", f"首列 {header[0]}，{len(header) - 1} 个 MAG")
        else:
            require(header == HEADERS[name], name, str(HEADERS[name]), header)
        require(all(len(row) == len(header) for row in rows), name, "各行列数与表头一致", "不规则行")
        key_index = 2 if name == LINEAGE else 0
        keys = [row[key_index] for row in rows]
        if name == LINEAGE:
            expected_count = contract.members
        else:
            expected_count = contract.mags if name in {LENGTHS, TAXONOMY, QUALITY, CROSSWALK} else contract.samples
        require(len(rows) == expected_count, name, f"{expected_count} 行", len(rows))
        require(len(set(keys)) == len(keys) and all(keys), name, "非空唯一主键", "重复或空主键")
        headers[name], tables[name] = header, rows
        if name not in verified_content:
            file_hash = hashlib.sha256(content).hexdigest()
            digest.update(f"{name}\0{file_hash}\n".encode())
            sources.append({"file": f"development_input/{version}/{name}", "sha256": file_hash, "bytes": len(content)})
    require(_signatures(root, version) == signatures, MATRIX, "读取期间文件不变", "文件发生变化，请重试")
    sample_ids = tuple(row[0] for row in tables[MATRIX])
    mag_ids = tuple(headers[MATRIX][1:])
    require(all(re.fullmatch(r"CRR\d+", key) for key in sample_ids), MATRIX, "CRR 样本 ID", "存在非 CRR ID")
    require(all(re.fullmatch(r"[A-Za-z0-9_.-]+", key) for key in mag_ids), MATRIX, "非空 MAG ID", "非法 MAG ID")
    for name in (MANIFEST, MAPPING, METADATA):
        require({row[0] for row in tables[name]} == set(sample_ids), name, "样本 ID 集合与丰度矩阵一致", "ID 集合不匹配")
    require({row[0] for row in tables[LENGTHS]} == set(mag_ids), LENGTHS, "MAG 集合与丰度矩阵一致", "ID 集合不匹配")
    for name in (TAXONOMY, QUALITY):
        if name in tables:
            require({row[0] for row in tables[name]} == set(mag_ids), name,
                    "MAG 集合与丰度矩阵一致", "ID 集合不匹配")

    def numbers(values, name):
        try:
            result = np.asarray(values, dtype=float)
        except (ValueError, TypeError) as exc:
            raise MagDataError(name, "数值字段", "无法解析数值", version) from exc
        require(bool(np.isfinite(result).all()), name, "有限数值", "NaN 或 Infinity")
        return result

    def optional_number(value: str, name: str) -> float | None:
        if not value or value == "N/A":
            return None
        return float(numbers(value, name))

    matrix = numbers([row[1:] for row in tables[MATRIX]], MATRIX)
    require(bool(((matrix >= 0) & (matrix <= 100)).all()), MATRIX, "0–100 的相对丰度（%）", "数值越界")
    metadata = {row[0]: dict(zip(headers[METADATA], row, strict=True)) for row in tables[METADATA]}
    groups = Counter(row["disease"] for row in metadata.values())
    require(groups == {"AD": contract.ad, "NC": contract.nc}, METADATA,
            f"disease: AD {contract.ad} / NC {contract.nc}", dict(groups))
    mapping = {row[0]: row[1:] for row in tables[MAPPING]}
    mapping_values = numbers([mapping[sid] for sid in sample_ids], MAPPING)
    require(bool(((mapping_values >= 0) & (mapping_values <= 100)).all()), MAPPING, "0–100（%）", "数值越界")
    require(bool(np.allclose(mapping_values.sum(axis=1), 100, rtol=0, atol=MAPPING_TOLERANCE)), MAPPING,
            "mapped + unmapped = 100（容差 0.001 个百分点）", "比例和异常")
    errors = abs(matrix.sum(axis=1) - mapping_values[:, 1])
    require(bool((errors <= MAPPING_TOLERANCE).all()), MATRIX,
            "行和等于映射比例（容差 0.001 个百分点，不重归一化）", f"最大偏差 {float(errors.max()):.8g} 个百分点")
    length_map = {row[0]: row[1] for row in tables[LENGTHS]}
    lengths = numbers([length_map[mid] for mid in mag_ids], LENGTHS)
    require(bool(((lengths > 0) & (lengths == np.floor(lengths))).all()), LENGTHS, "正整数 bp", "非法长度")
    taxonomy: tuple[dict[str, Any], ...] = ()
    if TAXONOMY in tables:
        taxonomy_map = {row[0]: dict(zip(headers[TAXONOMY], row, strict=True)) for row in tables[TAXONOMY]}

        taxonomy_rows = []
        for mag_id in mag_ids:
            row = taxonomy_map[mag_id]
            require(bool(row["domain"]), TAXONOMY, "每个 MAG 至少包含 domain", mag_id)
            closest_ani = optional_number(row["closest_ani"], TAXONOMY)
            closest_af = optional_number(row["closest_af"], TAXONOMY)
            msa_percent = optional_number(row["msa_percent"], TAXONOMY)
            require(closest_ani is None or 0 <= closest_ani <= 100, TAXONOMY, "closest_ani: 0–100 或空", mag_id)
            require(closest_af is None or 0 <= closest_af <= 1, TAXONOMY, "closest_af: 0–1 或空", mag_id)
            require(msa_percent is None or 0 <= msa_percent <= 100, TAXONOMY, "msa_percent: 0–100 或空", mag_id)
            taxonomy_rows.append({
                "magId": mag_id,
                **{rank: row[rank] for rank in TAXONOMY_RANKS},
                "classificationMethod": row["classification_method"],
                "closestReference": None if row["closest_reference"].strip().lower() in {"", "n/a", "na", "none"} else row["closest_reference"],
                "closestAni": closest_ani,
                "closestAf": closest_af,
                "msaPercent": msa_percent,
            })
        taxonomy = tuple(taxonomy_rows)
    quality: tuple[dict[str, Any], ...] = ()
    if QUALITY in tables:
        quality_map = {row[0]: dict(zip(headers[QUALITY], row, strict=True)) for row in tables[QUALITY]}
        quality_rows = []
        for mag_id, length in zip(mag_ids, lengths, strict=True):
            row = quality_map[mag_id]
            numeric = numbers([row[column] for column in HEADERS[QUALITY][1:] if column != "completeness_model"], QUALITY)
            completeness, contamination, coding_density, contig_n50, genome_size, gc_content, coding_sequences, total_contigs, max_contig = numeric
            require(50 <= completeness <= 100, QUALITY, "completeness_percent: 50–100", mag_id)
            require(0 <= contamination <= 10, QUALITY, "contamination_percent: 0–10", mag_id)
            require(0 <= coding_density <= 1 and 0 <= gc_content <= 1, QUALITY, "coding_density/gc_content: 0–1", mag_id)
            integer_values = (contig_n50, genome_size, coding_sequences, total_contigs, max_contig)
            require(all(value > 0 and value == np.floor(value) for value in integer_values), QUALITY,
                    "长度及计数为正整数", mag_id)
            require(int(genome_size) == int(length), QUALITY, "genome_size_bp 与 mag_length 一致", mag_id)
            require(bool(row["completeness_model"]), QUALITY, "非空 completeness_model", mag_id)
            quality_rows.append({
                "magId": mag_id,
                "completenessPercent": float(completeness),
                "contaminationPercent": float(contamination),
                "completenessModel": row["completeness_model"],
                "codingDensity": float(coding_density),
                "contigN50Bp": int(contig_n50),
                "genomeSizeBp": int(genome_size),
                "gcContent": float(gc_content),
                "totalCodingSequences": int(coding_sequences),
                "totalContigs": int(total_contigs),
                "maxContigLengthBp": int(max_contig),
                "inReferenceBand": bool(completeness >= 90 and contamination <= 5),
            })
        quality = tuple(quality_rows)

    lineage: tuple[dict[str, Any], ...] = ()
    if LINEAGE in tables:
        lineage_rows: list[dict[str, Any]] = []
        for values in tables[LINEAGE]:
            raw_row = dict(zip(headers[LINEAGE], values, strict=True))
            ani = float(numbers(raw_row["member_to_rep_ani"], LINEAGE))
            coverage = float(numbers(raw_row["member_to_rep_alignment_coverage"], LINEAGE))
            member_completeness = float(numbers(raw_row["member_completeness_percent"], LINEAGE))
            member_contamination = float(numbers(raw_row["member_contamination_percent"], LINEAGE))
            representative_completeness = float(numbers(raw_row["representative_completeness_percent"], LINEAGE))
            representative_contamination = float(numbers(raw_row["representative_contamination_percent"], LINEAGE))
            representative_score = float(numbers(raw_row["representative_score"], LINEAGE))
            distance_threshold = float(numbers(raw_row["secondary_cluster_distance_threshold"], LINEAGE))
            equivalent_threshold = float(numbers(raw_row["equivalent_ani_threshold"], LINEAGE))
            require(raw_row["is_representative"] in {"true", "false"}, LINEAGE, "is_representative 为 true/false", raw_row["is_representative"])
            require(raw_row["representative_source_sample_id"] in sample_ids and raw_row["member_source_sample_id"] in sample_ids,
                    LINEAGE, "来源样本均存在于 metadata", raw_row["member_mag"])
            require(raw_row["representative_disease"] in {"AD", "NC"} and raw_row["member_disease"] in {"AD", "NC"},
                    LINEAGE, "disease 为 AD/NC", raw_row["member_mag"])
            require(raw_row["representative_group"] in {"CHN", "CHN2"} and raw_row["member_group"] in {"CHN", "CHN2"},
                    LINEAGE, "Group 为 CHN/CHN2 来源组", raw_row["member_mag"])
            require(0 <= ani <= 1 and 0 <= coverage <= 1, LINEAGE, "ANI 与比对覆盖度为 0–1", raw_row["member_mag"])
            require(raw_row["ani_direction"] == "representative_reference__member_query", LINEAGE,
                    "代表 MAG 为 reference、成员 MAG 为 query", raw_row["ani_direction"])
            require(raw_row["cluster_method"] == "average" and raw_row["comparison_algorithm"] == "fastANI", LINEAGE,
                    "average linkage 与 fastANI", f"{raw_row['cluster_method']} / {raw_row['comparison_algorithm']}")
            lineage_rows.append({
                "clusterId": raw_row["cluster_id"],
                "representativeMag": raw_row["representative_mag"],
                "memberMag": raw_row["member_mag"],
                "isRepresentative": raw_row["is_representative"] == "true",
                "clusterMemberCount": int(numbers(raw_row["cluster_member_count"], LINEAGE)),
                "representativeSourceSampleId": raw_row["representative_source_sample_id"],
                "representativeSampleName": raw_row["representative_sample_name"],
                "representativeSampleAccession": raw_row["representative_sample_accession"],
                "representativeDisease": raw_row["representative_disease"],
                "representativeGroup": raw_row["representative_group"],
                "representativeHpcBatch": raw_row["representative_hpc_batch"],
                "memberSourceSampleId": raw_row["member_source_sample_id"],
                "memberSampleName": raw_row["member_sample_name"],
                "memberSampleAccession": raw_row["member_sample_accession"],
                "memberDisease": raw_row["member_disease"],
                "memberGroup": raw_row["member_group"],
                "memberHpcBatch": raw_row["member_hpc_batch"],
                "memberToRepAni": ani,
                "memberToRepAlignmentCoverage": coverage,
                "aniDirection": raw_row["ani_direction"],
                "memberCompletenessPercent": member_completeness,
                "memberContaminationPercent": member_contamination,
                "representativeCompletenessPercent": representative_completeness,
                "representativeContaminationPercent": representative_contamination,
                "representativeScore": representative_score,
                "secondaryClusterDistanceThreshold": distance_threshold,
                "equivalentAniThreshold": equivalent_threshold,
                "clusterMethod": raw_row["cluster_method"],
                "comparisonAlgorithm": raw_row["comparison_algorithm"],
                "primaryCluster": raw_row["primary_cluster"],
            })
        clusters: dict[str, list[dict[str, Any]]] = {}
        for lineage_row in lineage_rows:
            clusters.setdefault(lineage_row["clusterId"], []).append(lineage_row)
        manifest = annotation_manifest or {}
        require(manifest.get("memberMagCount") == contract.members, V3_MANIFEST,
                f"memberMagCount={contract.members}", manifest.get("memberMagCount"))
        require(manifest.get("secondaryClusterCount") == contract.clusters, V3_MANIFEST,
                f"secondaryClusterCount={contract.clusters}", manifest.get("secondaryClusterCount"))
        require(len(clusters) == contract.clusters, LINEAGE, f"{contract.clusters} 个二级聚类", len(clusters))
        require(len({row["representativeMag"] for row in lineage_rows}) == contract.mags, LINEAGE,
                f"{contract.mags} 个代表 MAG", len({row["representativeMag"] for row in lineage_rows}))
        require({row["representativeMag"] for row in lineage_rows} == set(mag_ids), LINEAGE,
                "代表 MAG 集合与丰度矩阵一致", "ID 集合不匹配")
        require(len({row["memberSourceSampleId"] for row in lineage_rows}) == contract.samples, LINEAGE,
                f"{contract.samples} 个来源样本", len({row["memberSourceSampleId"] for row in lineage_rows}))
        for cluster_id, cluster_members in clusters.items():
            representatives = [member for member in cluster_members if member["isRepresentative"]]
            require(len(representatives) == 1 and representatives[0]["memberMag"] == representatives[0]["representativeMag"],
                    LINEAGE, "每个聚类恰有一条代表自身记录", cluster_id)
            require(len(cluster_members) == cluster_members[0]["clusterMemberCount"]
                    and all(member["clusterMemberCount"] == len(cluster_members) for member in cluster_members),
                    LINEAGE, "cluster_member_count 与实际成员数一致", cluster_id)
        low_ani_count = sum(row["memberToRepAni"] < 0.95 for row in lineage_rows)
        require(low_ani_count == contract.low_ani_members, LINEAGE,
                f"保留 {contract.low_ani_members} 条 member_to_rep_ani < 0.95", low_ani_count)
        lineage = tuple(lineage_rows)

    crosswalk: tuple[dict[str, Any], ...] = ()
    if CROSSWALK in tables:
        crosswalk_rows: list[dict[str, Any]] = []
        for values in tables[CROSSWALK]:
            raw_crosswalk = dict(zip(headers[CROSSWALK], values, strict=True))
            require(raw_crosswalk["mapping_status"] in MAPPING_STATUSES, CROSSWALK,
                    f"mapping_status 属于 {MAPPING_STATUSES}", raw_crosswalk["mapping_status"])
            crosswalk_rows.append({
                "magId": raw_crosswalk["MAG_ID"],
                "gtdbSpecies": raw_crosswalk["gtdb_species"] or None,
                "gtdbClassification": raw_crosswalk["gtdb_classification"] or None,
                "gtdbReferenceAccession": raw_crosswalk["gtdb_reference_accession"] or None,
                "gtdbReferenceSourceField": raw_crosswalk["gtdb_reference_source_field"] or None,
                "gtdbReferenceAni": optional_number(raw_crosswalk["gtdb_reference_ani"], CROSSWALK),
                "gtdbReferenceAf": optional_number(raw_crosswalk["gtdb_reference_af"], CROSSWALK),
                "gtdbClassificationMethod": raw_crosswalk["gtdb_classification_method"] or None,
                "referenceNcbiTaxid": raw_crosswalk["reference_ncbi_taxid"] or None,
                "ncbiSpeciesTaxid": raw_crosswalk["ncbi_species_taxid"] or None,
                "ncbiOrganismName": raw_crosswalk["ncbi_organism_name"] or None,
                "ncbiTaxonomy": raw_crosswalk["ncbi_taxonomy"] or None,
                "krakenSpeciesId": raw_crosswalk["kraken_species_id"] or None,
                "krakenSpeciesName": raw_crosswalk["kraken_species_name"] or None,
                "krakenMpaSpeciesLabel": raw_crosswalk["kraken_mpa_species_label"] or None,
                "mappingMethod": raw_crosswalk["mapping_method"] or None,
                "mappingLevel": raw_crosswalk["mapping_level"] or None,
                "mappingConfidence": raw_crosswalk["mapping_confidence"] or None,
                "mappingStatus": raw_crosswalk["mapping_status"],
            })
        require({row["magId"] for row in crosswalk_rows} == set(mag_ids), CROSSWALK,
                "每个代表 MAG 恰有一条 crosswalk", "ID 集合不匹配")
        status_counts = Counter(row["mappingStatus"] for row in crosswalk_rows)
        require(status_counts == {
            "matched_exact_ncbi_species_taxid": contract.crosswalk_exact,
            "ncbi_species_taxid_not_observed_in_reads": contract.crosswalk_not_observed,
            "no_gtdb_reference": contract.crosswalk_unresolved,
        }, CROSSWALK,
            f"mapping_status 计数 {contract.crosswalk_exact}/{contract.crosswalk_not_observed}/{contract.crosswalk_unresolved}",
            dict(status_counts))
        crosswalk = tuple(crosswalk_rows)
    input_manifest = {
        row[0]: dict(zip(headers[MANIFEST], row, strict=True))
        for row in tables[MANIFEST]
    }
    samples = []
    for i, sid in enumerate(sample_ids):
        row = metadata[sid]
        input_row = input_manifest[sid]
        age = float(numbers(row["Age"], METADATA))
        require(0 <= age <= 120, METADATA, "0–120 岁", age)
        require(row["Gender"] in {"F", "M"}, METADATA, "Gender: F/M", row["Gender"])
        require(row["HPC_Batch"] in {"1", "2", "3", "4", "5"}, METADATA, "HPC_Batch: 1–5", row["HPC_Batch"])
        samples.append({
            "sampleId": sid, "disease": row["disease"], "age": age,
            "gender": row["Gender"], "batch": row["HPC_Batch"],
            "mappedPercent": float(mapping_values[i, 1]), "unmappedPercent": float(mapping_values[i, 0]),
            "sampleName": row["Sample_name"], "accession": row["Accession"],
            "sourceGroup": row["Group"], "r1Uri": input_row["R1"],
            "r2Uri": input_row["R2"], "covermLabel": input_row["CoverMLabel"],
        })
    matrix.setflags(write=False)
    return MagDataset(root, version, sample_ids, mag_ids, matrix, tuple(samples), tuple(int(n) for n in lengths),
                      digest.hexdigest(), tuple(sources), float(errors.max()), taxonomy, quality, annotation_manifest,
                      lineage, crosswalk)


def scope_indices(data: MagDataset, scope: MagScope) -> list[int]:
    if scope.age_min is not None and scope.age_max is not None and scope.age_min > scope.age_max:
        raise ValueError("最低年龄不能大于最高年龄。")
    return [i for i, sample in enumerate(data.samples) if (
        (not scope.disease or sample["disease"] == scope.disease)
        and (not scope.gender or sample["gender"] == scope.gender)
        and (not scope.batch or sample["batch"] == scope.batch)
        and (scope.age_min is None or sample["age"] >= scope.age_min)
        and (scope.age_max is None or sample["age"] <= scope.age_max)
    )]


def provenance(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    indices = scope_indices(data, scope)
    counts = Counter(data.samples[i]["disease"] for i in indices)
    analysis_version = "mag-exploration-v3" if data.lineage else ANALYSIS_VERSION
    request = json.dumps({"source": data.fingerprint, "scope": scope.as_dict(), "analysis": analysis_version}, sort_keys=True)
    warnings = [
        "探索性研究线索，不用于临床诊断，不代表已验证生物标志物或因果关系。",
        "使用 CoverM 原始相对丰度（%），未将 872 个 MAG 重归一化至 100%。",
        "双侧 Mann–Whitney U（渐近法、并列秩及连续性校正）；BH-FDR 在全部 MAG 上计算后再搜索或排序。",
        "年龄、性别和 HPC_Batch 筛选不是协变量校正；未控制混杂、组成性或重复探索的影响。",
        "映射比例不是基因组覆盖度或 CheckM2 完整度。",
    ]
    taxonomy_tool = (data.annotation_manifest or {}).get("tools", {}).get("taxonomy", {})
    if data.taxonomy:
        if not (taxonomy_tool.get("version") and taxonomy_tool.get("databaseRelease")):
            warnings.append("GTDB-Tk 与 GTDB reference release 版本未在源交付文件中完整记录；分类结果可追溯到输入文件，但版本信息仍待补充。")
    else:
        warnings.append("当前数据版本不含已核验的 MAG 分类输入。")
    if data.quality:
        warnings.append("完整度≥90%且污染率≤5%仅作为图中参考区间；缺少 rRNA/tRNA 等条件时不得称为 MIMAG 高质量 MAG。")
    else:
        warnings.append("当前数据版本不含已核验的 CheckM2 质量输入。")
    if bool((data.matrix > 0).all()):
        warnings.append("此版本所有丰度均大于零；阈值为 0 时超过阈值的比例全部为 100%。该阈值不代表生物学检出界限，也不改变丰度或统计检验。")
    if data.version not in UPSTREAM_GENERATION:
        warnings.append("当前数据版本未附带已核验的上游生成参数；这里只能追溯运行时输入和下游分析。")
    if data.lineage:
        warnings.extend([
            "disease 表示 AD/NC 疾病分组；Group 仅表示 CHN/CHN2 来源组，不是独立外部验证队列。",
            "dRep 跨样本聚类用于来源追溯与去冗余解释，不代表跨队列复现。",
            "taxonomy crosswalk 是分类标识符对应，不证明 reads 已直接比对到具体 MAG。",
            "24 条成员到代表 MAG 的实际 ANI 低于 0.95；这是 average-linkage 边界记录，保留实际值且不以等价阈值替代。",
        ])
    if counts.get("AD", 0) < 2 or counts.get("NC", 0) < 2:
        warnings.append("所选范围至少一组少于 2 个样本，p/q 值及秩效应量不计算。")
    return {
        "version": data.version, "analysisVersion": analysis_version,
        "storageBackend": data.storage_backend,
        "dataFingerprint": data.fingerprint, "requestFingerprint": hashlib.sha256(request.encode()).hexdigest(),
        "unit": "%", "groupField": "disease", "filters": scope.as_dict(),
        "sampleCount": len(indices), "excludedSampleCount": len(data.samples) - len(indices),
        "sampleIds": [data.sample_ids[i] for i in indices], "magCount": len(data.mag_ids),
        "groupCounts": {group: counts.get(group, 0) for group in ("AD", "NC")},
        "testedFeatureCount": len(data.mag_ids) if min(counts.get("AD", 0), counts.get("NC", 0)) >= 2 else 0,
        "sources": list(data.sources), "upstreamGeneration": UPSTREAM_GENERATION.get(data.version),
        "provenanceScope": "runtime-input-and-downstream-analysis",
        "mappingTolerancePercentPoints": MAPPING_TOLERANCE,
        "maxMappingErrorPercentPoints": data.max_mapping_error, "warnings": warnings,
        "manifest": {
            "file": next((source["file"] for source in data.sources if source["file"].endswith("_manifest.json")), None),
            "sha256": next((source["sha256"] for source in data.sources if source["file"].endswith("_manifest.json")), None),
            "buildDate": (data.annotation_manifest or {}).get("buildDate"),
            "status": (data.annotation_manifest or {}).get("status"),
        },
    }


def overview(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    selected = [data.samples[i] for i in scope_indices(data, scope)]
    batches = []
    for batch in sorted({s["batch"] for s in data.samples}):
        counts = Counter(s["disease"] for s in selected if s["batch"] == batch)
        batches.append({"batch": batch, "AD": counts.get("AD", 0), "NC": counts.get("NC", 0)})
    return {
        "provenance": provenance(data, scope), "batches": batches,
        "capabilities": {"taxonomy": bool(data.taxonomy), "quality": bool(data.quality),
                         "lineage": bool(data.lineage), "crosswalk": bool(data.crosswalk)},
        "options": {"genders": sorted({s["gender"] for s in data.samples}),
                    "batches": sorted({s["batch"] for s in data.samples}),
                    "ageMin": min(s["age"] for s in data.samples), "ageMax": max(s["age"] for s in data.samples)},
    }


def catalog(data: MagDataset) -> dict[str, Any]:
    """Catalog evidence is independent of sample filters and abundance statistics."""
    taxonomy = {row["magId"]: row for row in data.taxonomy}
    quality = {row["magId"]: row for row in data.quality}
    return {"provenance": provenance(data, MagScope()), "scopeKind": "catalog",
            "total": len(data.mag_ids), "items": [
                {"magId": mag_id, "taxonomy": taxonomy.get(mag_id), "quality": quality.get(mag_id)}
                for mag_id in data.mag_ids]}


def taxonomy_summary(data: MagDataset, scope: MagScope, rank: str = "phylum", top_n: int = 20) -> dict[str, Any]:
    if not data.taxonomy:
        raise MagDataError(TAXONOMY, "当前版本包含已核验的 MAG 分类输入", "未提供", data.version)
    if rank not in TAXONOMY_RANKS:
        raise ValueError("不支持的分类层级。")
    labels = [row[rank].strip() for row in data.taxonomy]
    unresolved = sum(not label for label in labels)
    counts = Counter(label or f"未解析至 {rank}" for label in labels)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    shown = ordered[:top_n]
    other_count = sum(count for _, count in ordered[top_n:])
    total = len(data.taxonomy)
    items = [{"label": label, "count": count, "percent": count / total * 100} for label, count in shown]
    if other_count:
        items.append({"label": "其他分类", "count": other_count, "percent": other_count / total * 100})
    manifest = data.annotation_manifest or {}
    taxonomy_tool = manifest.get("tools", {}).get("taxonomy", {})
    return {
        "provenance": provenance(data, scope),
        "rank": rank,
        "topN": top_n,
        "items": items,
        "totalMagCount": total,
        "distinctTaxonCount": len(counts),
        "resolvedMagCount": total - unresolved,
        "unresolvedMagCount": unresolved,
        "method": taxonomy_tool.get("name", "GTDB-Tk"),
        "version": taxonomy_tool.get("version"),
        "versionNote": taxonomy_tool.get("note"),
    }


def quality_summary(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    if not data.quality:
        raise MagDataError(QUALITY, "当前版本包含已核验的 CheckM2 质量输入", "未提供", data.version)
    completeness = [row["completenessPercent"] for row in data.quality]
    contamination = [row["contaminationPercent"] for row in data.quality]
    manifest = data.annotation_manifest or {}
    quality_tool = manifest.get("tools", {}).get("quality", {})
    return {
        "provenance": provenance(data, scope),
        "items": list(data.quality),
        "summary": {
            "totalMagCount": len(data.quality),
            "referenceBandCount": sum(row["inReferenceBand"] for row in data.quality),
            "completenessMinPercent": min(completeness),
            "completenessMaxPercent": max(completeness),
            "contaminationMinPercent": min(contamination),
            "contaminationMaxPercent": max(contamination),
        },
        "referenceBand": {
            "minimumCompletenessPercent": 90,
            "maximumContaminationPercent": 5,
            "label": "完整度≥90%且污染率≤5%的参考区间（非 MIMAG 高质量判定）",
        },
        "method": quality_tool.get("name", "CheckM2"),
        "version": quality_tool.get("version"),
    }


def _require_v3(data: MagDataset, capability: str) -> None:
    if capability == "lineage" and not data.lineage:
        raise MagDataError(LINEAGE, "当前版本包含已核验的 dRep 代表关系", "未提供", data.version)
    if capability == "crosswalk" and not data.crosswalk:
        raise MagDataError(CROSSWALK, "当前版本包含已核验的物种 crosswalk", "未提供", data.version)


@lru_cache(maxsize=4)
def lineage_cluster_summaries(data: MagDataset) -> tuple[dict[str, Any], ...]:
    _require_v3(data, "lineage")
    by_cluster: dict[str, list[dict[str, Any]]] = {}
    for row in data.lineage:
        by_cluster.setdefault(row["clusterId"], []).append(row)
    taxonomy = {row["magId"]: row for row in data.taxonomy}
    quality = {row["magId"]: row for row in data.quality}
    crosswalk = {row["magId"]: row for row in data.crosswalk}
    summaries = []
    for cluster_id, members in by_cluster.items():
        representative = members[0]["representativeMag"]
        ani_values = [row["memberToRepAni"] for row in members]
        coverage_values = [row["memberToRepAlignmentCoverage"] for row in members]
        taxonomy_row = taxonomy.get(representative, {})
        quality_row = quality.get(representative, {})
        mapping_row = crosswalk.get(representative, {})
        summaries.append({
            "clusterId": cluster_id,
            "representativeMag": representative,
            "memberCount": len(members),
            "sourceSampleCount": len({row["memberSourceSampleId"] for row in members}),
            "adMemberCount": sum(row["memberDisease"] == "AD" for row in members),
            "ncMemberCount": sum(row["memberDisease"] == "NC" for row in members),
            "sourceGroups": sorted({row["memberGroup"] for row in members}),
            "aniMin": min(ani_values),
            "aniMax": max(ani_values),
            "alignmentCoverageMin": min(coverage_values),
            "alignmentCoverageMax": max(coverage_values),
            "below095AniCount": sum(value < 0.95 for value in ani_values),
            "gtdbSpecies": taxonomy_row.get("species") or mapping_row.get("gtdbSpecies"),
            "completenessPercent": quality_row.get("completenessPercent"),
            "contaminationPercent": quality_row.get("contaminationPercent"),
            "mappingStatus": mapping_row.get("mappingStatus"),
        })
    return tuple(sorted(summaries, key=lambda row: row["clusterId"]))


LINEAGE_CLUSTER_SORT_FIELDS = {
    "clusterId", "representativeMag", "memberCount", "sourceSampleCount", "aniMin", "aniMax",
    "below095AniCount", "completenessPercent", "contaminationPercent",
}


def lineage_cluster_page(
    data: MagDataset,
    scope: MagScope,
    *,
    query: str = "",
    mapping_status: str = "",
    low_ani_only: bool = False,
    sort_by: str = "memberCount",
    direction: str = "desc",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_v3(data, "lineage")
    if sort_by not in LINEAGE_CLUSTER_SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的 lineage 聚类排序字段或方向。")
    needle = query.strip().casefold()
    summaries = lineage_cluster_summaries(data)
    exact_id = needle in {value.casefold() for row in summaries for value in (row["clusterId"], row["representativeMag"])}
    rows = [row for row in summaries if (
        needle in (row["clusterId"].casefold(), row["representativeMag"].casefold()) if exact_id else
        not needle or needle in row["clusterId"].casefold()
        or needle in row["representativeMag"].casefold()
        or needle in (row["gtdbSpecies"] or "").casefold()
    )]
    if mapping_status:
        rows = [row for row in rows if row["mappingStatus"] == mapping_status]
    if low_ani_only:
        rows = [row for row in rows if row["below095AniCount"] > 0]
    present = sorted((row for row in rows if row[sort_by] is not None), key=lambda row: row["clusterId"])
    present.sort(key=lambda row: row[sort_by], reverse=direction == "desc")
    missing = sorted((row for row in rows if row[sort_by] is None), key=lambda row: row["clusterId"])
    ordered = present + missing
    return {
        "provenance": provenance(data, scope),
        "items": ordered[offset:offset + limit],
        "total": len(ordered),
        "limit": limit,
        "offset": offset,
        "query": query,
        "mappingStatus": mapping_status,
        "lowAniOnly": low_ani_only,
        "sortBy": sort_by,
        "direction": direction,
        "summary": {
            "memberMagCount": len(data.lineage),
            "representativeMagCount": len(data.mag_ids),
            "secondaryClusterCount": len(lineage_cluster_summaries(data)),
            "sourceSampleCount": len({row["memberSourceSampleId"] for row in data.lineage}),
            "below095AniCount": sum(row["memberToRepAni"] < 0.95 for row in data.lineage),
        },
    }


LINEAGE_MEMBER_SORT_FIELDS = {"memberMag", "memberSourceSampleId", "memberToRepAni", "memberToRepAlignmentCoverage"}


def lineage_cluster_detail(
    data: MagDataset,
    scope: MagScope,
    cluster_id: str,
    *,
    query: str = "",
    disease: str = "",
    group: str = "",
    low_ani_only: bool = False,
    sort_by: str = "memberToRepAni",
    direction: str = "asc",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_v3(data, "lineage")
    if sort_by not in LINEAGE_MEMBER_SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的 lineage 成员排序字段或方向。")
    summary = next((row for row in lineage_cluster_summaries(data) if row["clusterId"] == cluster_id), None)
    if summary is None:
        raise KeyError("dRep 聚类不存在。")
    needle = query.strip().casefold()
    rows = [row for row in data.lineage if row["clusterId"] == cluster_id and (
        not needle or needle in row["memberMag"].casefold() or needle in row["memberSourceSampleId"].casefold()
    )]
    if disease:
        rows = [row for row in rows if row["memberDisease"] == disease]
    if group:
        rows = [row for row in rows if row["memberGroup"] == group]
    if low_ani_only:
        rows = [row for row in rows if row["memberToRepAni"] < 0.95]
    rows.sort(key=lambda row: (row[sort_by], row["memberMag"]), reverse=direction == "desc")
    return {
        "provenance": provenance(data, scope),
        "cluster": summary,
        "items": rows[offset:offset + limit],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "query": query,
        "disease": disease,
        "group": group,
        "lowAniOnly": low_ani_only,
        "sortBy": sort_by,
        "direction": direction,
    }


def mag_lineage(data: MagDataset, scope: MagScope, mag_id: str) -> dict[str, Any]:
    _require_v3(data, "lineage")
    member = next((row for row in data.lineage if row["memberMag"] == mag_id), None)
    if member is None:
        raise KeyError("MAG ID 不存在于 lineage。")
    cluster = next(row for row in lineage_cluster_summaries(data) if row["clusterId"] == member["clusterId"])
    crosswalk = next((row for row in data.crosswalk if row["magId"] == member["representativeMag"]), None)
    return {
        "provenance": provenance(data, scope),
        "queriedMagId": mag_id,
        "queryRole": "representative" if member["isRepresentative"] else "member",
        "cluster": cluster,
        "member": member,
        "crosswalk": crosswalk,
    }


def crosswalk_page(
    data: MagDataset,
    scope: MagScope,
    *,
    query: str = "",
    mapping_status: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    _require_v3(data, "crosswalk")
    needle = query.strip().casefold()
    exact_id = needle in {row["magId"].casefold() for row in data.crosswalk}
    rows = [row for row in data.crosswalk if (
        row["magId"].casefold() == needle if exact_id else
        not needle or needle in row["magId"].casefold()
        or needle in (row["gtdbSpecies"] or "").casefold()
        or needle in (row["ncbiOrganismName"] or "").casefold()
        or needle in (row["krakenSpeciesName"] or "").casefold()
    )]
    if mapping_status:
        rows = [row for row in rows if row["mappingStatus"] == mapping_status]
    rows.sort(key=lambda row: row["magId"])
    counts = Counter(row["mappingStatus"] for row in data.crosswalk)
    return {
        "provenance": provenance(data, scope),
        "items": rows[offset:offset + limit],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "query": query,
        "mappingStatus": mapping_status,
        "statusCounts": {status: counts.get(status, 0) for status in MAPPING_STATUSES},
    }


def raw_download_path(data: MagDataset, kind: str) -> Path:
    files = {"lineage": LINEAGE, "crosswalk": CROSSWALK}
    name = files.get(kind)
    if not name:
        raise KeyError("不支持的 MAG 原始下载类型。")
    _require_v3(data, kind)
    path = (data.root / name).resolve()
    if not path.is_relative_to(data.root.resolve()):
        raise MagDataError(name, f"位于 {data.version} 内的文件", "路径越界", data.version)
    return path


@lru_cache(maxsize=16)
def comparison_rows(data: MagDataset, scope: MagScope) -> tuple[dict[str, Any], ...]:
    indices = scope_indices(data, scope)
    values = data.matrix[indices]
    groups = {g: data.matrix[[i for i in indices if data.samples[i]["disease"] == g]] for g in ("AD", "NC")}
    ad, nc = groups["AD"], groups["NC"]
    testable = len(ad) >= 2 and len(nc) >= 2
    if testable:
        result = mannwhitneyu(ad, nc, axis=0, alternative="two-sided", method="asymptotic", use_continuity=True)
        p_values = np.where(np.isfinite(result.pvalue), result.pvalue, 1.0)
        q_values = benjamini_hochberg(p_values)
        effects = 2 * result.statistic / (len(ad) * len(nc)) - 1
    rows = []
    taxonomy_by_id = {row['magId']: row for row in data.taxonomy}
    quality_by_id = {row['magId']: row for row in data.quality}
    for j, mag_id in enumerate(data.mag_ids):
        taxonomy = taxonomy_by_id.get(mag_id, {})
        quality = quality_by_id.get(mag_id, {})
        taxonomy_rank = next((rank for rank in reversed(TAXONOMY_RANKS) if taxonomy.get(rank)), None)
        row: dict[str, Any] = {"magId": mag_id, "lengthBp": data.lengths[j],
                               "taxonomyName": taxonomy.get(taxonomy_rank) if taxonomy_rank else None,
                               "taxonomyRank": taxonomy_rank,
                               "taxonomy": {rank: taxonomy.get(rank) for rank in TAXONOMY_RANKS if taxonomy.get(rank)},
                               "completenessPercent": quality.get('completenessPercent'),
                               "contaminationPercent": quality.get('contaminationPercent'),
                               "meanPercent": float(values[:, j].mean()) if len(values) else None}
        for group, block in groups.items():
            prefix = group.lower()
            row[f"{prefix}MeanPercent"] = float(block[:, j].mean()) if len(block) else None
            row[f"{prefix}MedianPercent"] = float(np.median(block[:, j])) if len(block) else None
            row[f"{prefix}AboveThresholdPercent"] = float((block[:, j] > scope.abundance_threshold_percent).mean() * 100) if len(block) else None
        row["meanDifferencePercentPoints"] = row["adMeanPercent"] - row["ncMeanPercent"] if len(ad) and len(nc) else None
        row.update({"pValue": float(p_values[j]) if testable else None,
                    "qValue": float(q_values[j]) if testable else None,
                    "rankBiserial": float(effects[j]) if testable else None})
        rows.append(row)
    return tuple(rows)


SORT_FIELDS = {"magId", "meanPercent", "adMeanPercent", "ncMeanPercent", "meanDifferencePercentPoints", "qValue", "rankBiserial"}


def ordered_features(data: MagDataset, scope: MagScope, query: str = "", sort_by: str = "meanPercent", direction: str = "desc") -> list:
    if sort_by not in SORT_FIELDS or direction not in {"asc", "desc"}:
        raise ValueError("不支持的排序字段或方向。")
    needle = query.strip().casefold()
    exact_id = needle in {mag_id.casefold() for mag_id in data.mag_ids}
    rows = [row for row in comparison_rows(data, scope)
            if (row["magId"].casefold() == needle if exact_id else
                not needle or any(needle in value.casefold()
                                  for value in [row["magId"], *row["taxonomy"].values()]))]
    # Stable ties; missing statistics always last, in both directions.
    present = sorted((r for r in rows if r[sort_by] is not None), key=lambda r: r["magId"])
    present.sort(key=lambda r: r[sort_by], reverse=direction == "desc")
    return present + sorted((r for r in rows if r[sort_by] is None), key=lambda r: r["magId"])


def feature_page(data, scope, *, query="", sort_by="meanPercent", direction="desc", limit=25, offset=0):
    rows = ordered_features(data, scope, query, sort_by, direction)
    return {"provenance": provenance(data, scope), "items": rows[offset:offset + limit], "total": len(rows),
            "limit": limit, "offset": offset, "query": query, "sortBy": sort_by, "direction": direction}


def sample_rows(data: MagDataset, scope: MagScope) -> list[dict[str, Any]]:
    return [{**data.samples[i], "aboveThresholdMagCount": int((data.matrix[i] > scope.abundance_threshold_percent).sum())}
            for i in scope_indices(data, scope)]


def feature_distribution(data: MagDataset, scope: MagScope, mag_id: str) -> dict[str, Any]:
    try:
        column = data.mag_ids.index(mag_id)
    except ValueError as exc:
        raise KeyError("MAG ID 不存在。") from exc
    samples = [{**data.samples[i], "abundancePercent": float(data.matrix[i, column])} for i in scope_indices(data, scope)]
    boxes = []
    for group in ("AD", "NC"):
        values = np.asarray([s["abundancePercent"] for s in samples if s["disease"] == group])
        if not len(values):
            continue
        q1, median, q3 = np.percentile(values, [25, 50, 75])
        iqr = q3 - q1
        inliers = values[(values >= q1 - 1.5 * iqr) & (values <= q3 + 1.5 * iqr)]
        boxes.append({"group": group, "n": len(values), "values": [float(inliers.min()), float(q1), float(median), float(q3), float(inliers.max())]})
    return {"provenance": provenance(data, scope), "feature": comparison_rows(data, scope)[column],
            "samples": samples, "boxes": boxes}


def heatmap(data: MagDataset, scope: MagScope, top_n: int = 20, settings=None) -> dict[str, Any]:
    from app.services.mag_heatmap_service import build_heatmap

    return {"provenance": provenance(data, scope),
            **build_heatmap(data, scope_indices(data, scope), comparison_rows(data, scope), top_n, settings)}


def stream_csv(rows, columns):
    buffer = io.StringIO()
    writer = SpreadsheetSafeDictWriter(buffer, columns)
    writer.writeheader()
    yield ("\ufeff" + buffer.getvalue()).encode("utf-8")
    for start in range(0, len(rows), 250):
        buffer.seek(0)
        buffer.truncate(0)
        writer.writerows(rows[start:start + 250])
        yield buffer.getvalue().encode("utf-8")
