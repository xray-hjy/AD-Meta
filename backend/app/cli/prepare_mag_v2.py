"""Build a validated mag_v2 package from the delivered MAG source files.

This is an explicit preparation step. Runtime APIs continue to read only the
versioned ``development_input`` package and never reach into ``source_data``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import BACKEND_ROOT, SETTINGS
from app.services import mag_data_service as service

SOURCE_VERSION = "mag_v1"
TARGET_VERSION = "mag_v2"
TAXONOMY_SOURCE_FILES = (
    "source_data/data/AD_dRep.bac120.summary.tsv",
    "source_data/data/AD_dRep.ar53.summary.tsv",
)
QUALITY_SOURCE_FILE = "source_data/data/quality_report.tsv"

TAXONOMY_COLUMNS = [
    "MAG",
    "domain",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "classification_method",
    "closest_reference",
    "closest_ani",
    "closest_af",
    "msa_percent",
]
QUALITY_COLUMNS = [
    "MAG",
    "completeness_percent",
    "contamination_percent",
    "completeness_model",
    "coding_density",
    "contig_n50_bp",
    "genome_size_bp",
    "gc_content",
    "total_coding_sequences",
    "total_contigs",
    "max_contig_length_bp",
]
RANK_PREFIXES = {
    "d__": "domain",
    "p__": "phylum",
    "c__": "class",
    "o__": "order",
    "f__": "family",
    "g__": "genus",
    "s__": "species",
}


def _package_root() -> Path:
    configured = SETTINGS.mag_data_root
    return configured if configured.is_absolute() else BACKEND_ROOT.parent / configured


def _read_dicts(path: Path, delimiter: str = "\t") -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=delimiter))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _taxonomy_rows(package: Path, mag_ids: tuple[str, ...]) -> list[dict[str, Any]]:
    source_rows: dict[str, dict[str, str]] = {}
    for relative in TAXONOMY_SOURCE_FILES:
        path = package / relative
        _require(path.is_file(), f"缺少 GTDB-Tk 结果：{relative}")
        for row in _read_dicts(path):
            mag_id = row.get("user_genome", "").strip()
            _require(bool(mag_id), f"{relative} 存在空 user_genome")
            _require(mag_id not in source_rows, f"GTDB-Tk 结果存在重复 MAG：{mag_id}")
            source_rows[mag_id] = row
    _require(set(source_rows) == set(mag_ids), "GTDB-Tk MAG 集合与当前 872 个代表 MAG 不一致")

    normalized = []
    for mag_id in mag_ids:
        source = source_rows[mag_id]
        ranks = {rank: "" for rank in RANK_PREFIXES.values()}
        for token in source["classification"].split(";"):
            prefix = token[:3]
            if prefix in RANK_PREFIXES:
                ranks[RANK_PREFIXES[prefix]] = token[3:].strip()
        _require(bool(ranks["domain"]), f"GTDB-Tk 分类缺少 domain：{mag_id}")
        normalized.append({
            "MAG": mag_id,
            **ranks,
            "classification_method": source.get("classification_method", "").strip(),
            "closest_reference": source.get("closest_genome_reference", "").strip(),
            "closest_ani": source.get("closest_genome_ani", "").strip(),
            "closest_af": source.get("closest_genome_af", "").strip(),
            "msa_percent": source.get("msa_percent", "").strip(),
        })
    return normalized


def _quality_rows(package: Path, mag_ids: tuple[str, ...], lengths: tuple[int, ...]) -> list[dict[str, Any]]:
    path = package / QUALITY_SOURCE_FILE
    _require(path.is_file(), f"缺少 CheckM2 结果：{QUALITY_SOURCE_FILE}")
    source_rows = _read_dicts(path)
    by_id = {row.get("Name", "").strip(): row for row in source_rows}
    _require(len(by_id) == len(source_rows), "CheckM2 结果存在重复或空 Name")
    _require(not (set(mag_ids) - set(by_id)), "CheckM2 结果未覆盖全部 872 个代表 MAG")

    normalized = []
    for mag_id, expected_length in zip(mag_ids, lengths, strict=True):
        source = by_id[mag_id]
        genome_size = int(source["Genome_Size"])
        _require(genome_size == expected_length, f"CheckM2 Genome_Size 与 mag_length 不一致：{mag_id}")
        normalized.append({
            "MAG": mag_id,
            "completeness_percent": source["Completeness"],
            "contamination_percent": source["Contamination"],
            "completeness_model": source["Completeness_Model_Used"],
            "coding_density": source["Coding_Density"],
            "contig_n50_bp": source["Contig_N50"],
            "genome_size_bp": source["Genome_Size"],
            "gc_content": source["GC_Content"],
            "total_coding_sequences": source["Total_Coding_Sequences"],
            "total_contigs": source["Total_Contigs"],
            "max_contig_length_bp": source["Max_Contig_Length"],
        })
    return normalized


def _write_tsv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def build(
    package: Path,
    source_version: str,
    target_version: str,
    contract: service.MagContract = service.DEFAULT_CONTRACT,
) -> dict[str, Any]:
    _require(source_version != target_version, "源版本和目标版本不能相同")
    data = service.load_mag_dataset(package, contract=contract, version=source_version)
    development_input = package / "development_input"
    source_root = development_input / source_version
    target_root = development_input / target_version
    _require(not target_root.exists(), f"目标已存在：{target_root}；请使用新的 mag_vN 版本名")

    taxonomy = _taxonomy_rows(package, data.mag_ids)
    quality = _quality_rows(package, data.mag_ids, data.lengths)
    temporary = Path(tempfile.mkdtemp(prefix=f".{target_version}-", dir=development_input))
    try:
        for relative in service.CORE_FILES:
            destination = temporary / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_root / relative, destination)
        _write_tsv(temporary / service.TAXONOMY, TAXONOMY_COLUMNS, taxonomy)
        _write_tsv(temporary / service.QUALITY, QUALITY_COLUMNS, quality)
        manifest = {
            "version": target_version,
            "parentVersion": source_version,
            "magCount": len(data.mag_ids),
            "normalizedInputs": [service.TAXONOMY, service.QUALITY],
            "sourceFiles": [
                {"file": relative, "sha256": _sha256(package / relative)}
                for relative in (*TAXONOMY_SOURCE_FILES, QUALITY_SOURCE_FILE)
            ],
            "tools": {
                "taxonomy": {"name": "GTDB-Tk", "version": None, "note": "版本与 GTDB release 未在交付文件中记录"},
                "quality": {"name": "CheckM2", "version": "1.1.0"},
            },
            "qualityScreen": {"minimumCompletenessPercent": 50, "maximumContaminationPercent": 10},
        }
        manifest_path = temporary / service.ANNOTATION_MANIFEST
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.rename(target_root)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {
        "status": "created",
        "path": str(target_root),
        "version": target_version,
        "magCount": len(data.mag_ids),
        "taxonomyRows": len(taxonomy),
        "qualityRows": len(quality),
        "unresolvedSpecies": sum(not row["species"] for row in taxonomy),
        "referenceBandCount": sum(
            float(row["completeness_percent"]) >= 90 and float(row["contamination_percent"]) <= 5
            for row in quality
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-version", default=SOURCE_VERSION)
    parser.add_argument("--target-version", default=TARGET_VERSION)
    args = parser.parse_args()
    try:
        result = build(_package_root(), args.source_version, args.target_version)
    except (OSError, ValueError, service.MagDataError) as exc:
        print(json.dumps({"status": "invalid", "detail": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
