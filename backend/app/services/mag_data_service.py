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
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg
from app.core.config import BACKEND_ROOT, SETTINGS

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
ANNOTATION_MANIFEST = "provenance/mag_v2_manifest.json"
CORE_FILES = (MATRIX, MANIFEST, LENGTHS, MAPPING, METADATA)
ANNOTATION_FILES = (TAXONOMY, QUALITY, ANNOTATION_MANIFEST)
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
}
TAXONOMY_RANKS = ("domain", "phylum", "class", "order", "family", "genus", "species")


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


def _require(condition: bool, file: str, expected: str, actual: Any, version: str = DEFAULT_VERSION) -> None:
    if not condition:
        raise MagDataError(file, expected, str(actual), version)


def _version_files(version: str) -> tuple[str, ...]:
    version_number = int(version.removeprefix("mag_v"))
    return (*CORE_FILES, *ANNOTATION_FILES) if version_number >= 2 else CORE_FILES


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


def load_mag_dataset(
    package_root: Path | None = None,
    contract: MagContract = DEFAULT_CONTRACT,
    version: str | None = None,
) -> MagDataset:
    configured = package_root if package_root is not None else SETTINGS.mag_data_root
    configured_version = version or SETTINGS.mag_data_version
    if not re.fullmatch(r"mag_v[1-9]\d*", configured_version):
        raise MagDataError(".", "版本名格式 mag_vN", configured_version, configured_version)
    package = configured if configured.is_absolute() else BACKEND_ROOT.parent / configured
    root = package / "development_input" / configured_version
    return _load_snapshot(root, _signatures(root, configured_version), contract, configured_version)


@lru_cache(maxsize=2)
def _load_snapshot(root: Path, signatures: tuple, contract: MagContract, version: str) -> MagDataset:
    def require(condition: bool, file: str, expected: str, actual: Any) -> None:
        _require(condition, file, expected, actual, version)

    tables, headers, sources = {}, {}, []
    digest = hashlib.sha256()
    table_files = tuple(name for name in _version_files(version) if name != ANNOTATION_MANIFEST)
    for name in table_files:
        try:
            content = (root / name).read_bytes()
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
        keys = [row[0] for row in rows]
        expected_count = contract.mags if name in {LENGTHS, TAXONOMY, QUALITY} else contract.samples
        require(len(rows) == expected_count, name, f"{expected_count} 行", len(rows))
        require(len(set(keys)) == len(keys) and all(keys), name, "非空唯一主键", "重复或空主键")
        headers[name], tables[name] = header, rows
        file_hash = hashlib.sha256(content).hexdigest()
        digest.update(f"{name}\0{file_hash}\n".encode())
        sources.append({"file": f"development_input/{version}/{name}", "sha256": file_hash, "bytes": len(content)})
    annotation_manifest = None
    if ANNOTATION_MANIFEST in _version_files(version):
        manifest_path = root / ANNOTATION_MANIFEST
        try:
            manifest_content = manifest_path.read_bytes()
            annotation_manifest = json.loads(manifest_content.decode("utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise MagDataError(ANNOTATION_MANIFEST, "可读取的 UTF-8 JSON", type(exc).__name__, version) from exc
        require(annotation_manifest.get("version") == version, ANNOTATION_MANIFEST, f"version={version}", annotation_manifest.get("version"))
        require(annotation_manifest.get("magCount") == contract.mags, ANNOTATION_MANIFEST,
                f"magCount={contract.mags}", annotation_manifest.get("magCount"))
        manifest_hash = hashlib.sha256(manifest_content).hexdigest()
        digest.update(f"{ANNOTATION_MANIFEST}\0{manifest_hash}\n".encode())
        sources.append({"file": f"development_input/{version}/{ANNOTATION_MANIFEST}",
                        "sha256": manifest_hash, "bytes": len(manifest_content)})
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

        def optional_number(value: str, name: str) -> float | None:
            if not value or value == "N/A":
                return None
            parsed = float(numbers(value, name))
            return parsed

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
                "closestReference": row["closest_reference"] or None,
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
    samples = []
    for i, sid in enumerate(sample_ids):
        row = metadata[sid]
        age = float(numbers(row["Age"], METADATA))
        require(0 <= age <= 120, METADATA, "0–120 岁", age)
        require(row["Gender"] in {"F", "M"}, METADATA, "Gender: F/M", row["Gender"])
        require(row["HPC_Batch"] in {"1", "2", "3", "4", "5"}, METADATA, "HPC_Batch: 1–5", row["HPC_Batch"])
        samples.append({
            "sampleId": sid, "disease": row["disease"], "age": age,
            "gender": row["Gender"], "batch": row["HPC_Batch"],
            "mappedPercent": float(mapping_values[i, 1]), "unmappedPercent": float(mapping_values[i, 0]),
        })
    matrix.setflags(write=False)
    return MagDataset(version, sample_ids, mag_ids, matrix, tuple(samples), tuple(int(n) for n in lengths),
                      digest.hexdigest(), tuple(sources), float(errors.max()), taxonomy, quality, annotation_manifest)


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
    request = json.dumps({"source": data.fingerprint, "scope": scope.as_dict(), "analysis": ANALYSIS_VERSION}, sort_keys=True)
    warnings = [
        "探索性研究线索，不用于临床诊断，不代表已验证生物标志物或因果关系。",
        "使用 CoverM 原始相对丰度（%），未将 872 个 MAG 重归一化至 100%。",
        "双侧 Mann–Whitney U（渐近法、并列秩及连续性校正）；BH-FDR 在全部 MAG 上计算后再搜索或排序。",
        "年龄、性别和 HPC_Batch 筛选不是协变量校正；未控制混杂、组成性或重复探索的影响。",
        "映射比例不是基因组覆盖度或 CheckM2 完整度。",
    ]
    if data.taxonomy:
        warnings.append("GTDB-Tk 与 GTDB reference release 版本未在源交付文件中记录；分类结果可追溯到输入文件，但版本信息仍待补充。")
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
    if counts.get("AD", 0) < 2 or counts.get("NC", 0) < 2:
        warnings.append("所选范围至少一组少于 2 个样本，p/q 值及秩效应量不计算。")
    return {
        "version": data.version, "analysisVersion": ANALYSIS_VERSION,
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
    }


def overview(data: MagDataset, scope: MagScope) -> dict[str, Any]:
    selected = [data.samples[i] for i in scope_indices(data, scope)]
    batches = []
    for batch in sorted({s["batch"] for s in data.samples}):
        counts = Counter(s["disease"] for s in selected if s["batch"] == batch)
        batches.append({"batch": batch, "AD": counts.get("AD", 0), "NC": counts.get("NC", 0)})
    return {
        "provenance": provenance(data, scope), "batches": batches,
        "capabilities": {"taxonomy": bool(data.taxonomy), "quality": bool(data.quality)},
        "options": {"genders": sorted({s["gender"] for s in data.samples}),
                    "batches": sorted({s["batch"] for s in data.samples}),
                    "ageMin": min(s["age"] for s in data.samples), "ageMax": max(s["age"] for s in data.samples)},
    }


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
    for j, mag_id in enumerate(data.mag_ids):
        row: dict[str, Any] = {"magId": mag_id, "lengthBp": data.lengths[j],
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
    rows = [row for row in comparison_rows(data, scope) if query.strip().casefold() in row["magId"].casefold()]
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


def heatmap(data: MagDataset, scope: MagScope, top_n: int = 20) -> dict[str, Any]:
    ranked = ordered_features(data, scope)[:top_n]
    columns = [data.mag_ids.index(r["magId"]) for r in ranked]
    # Explicit stratification, not clustering or significance-driven selection.
    indices = sorted(scope_indices(data, scope), key=lambda i: (data.samples[i]["disease"], data.samples[i]["batch"], data.sample_ids[i]))
    return {"provenance": provenance(data, scope), "magIds": [r["magId"] for r in ranked],
            "samples": [data.samples[i] for i in indices],
            "values": data.matrix[np.ix_(indices, columns)].tolist(),
            "selection": "所选样本平均丰度降序 Top N；全部样本按 disease / HPC_Batch / CRR ID 排序；不聚类。"}


def stream_csv(rows, columns):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    yield ("\ufeff" + buffer.getvalue()).encode("utf-8")
    for start in range(0, len(rows), 250):
        buffer.seek(0)
        buffer.truncate(0)
        writer.writerows(rows[start:start + 250])
        yield buffer.getvalue().encode("utf-8")
