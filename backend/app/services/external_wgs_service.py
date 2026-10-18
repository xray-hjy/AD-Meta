"""Read author's versioned WGS profiles without relabelling them as GMrepo/clinical AD."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import statistics
from functools import lru_cache

from app.core.config import BACKEND_ROOT

ROOT = BACKEND_ROOT.parent / "ADMetaData/reference/external-wgs/PRJNA798058/2026-10-15-v1"
AUTHOR_FILES = BACKEND_ROOT.parent / "ADMetaData/reference/gmrepo/release-sources/2026-10-15-v2"
AUTHOR_RECORD = BACKEND_ROOT.parent / "ADMetaData/reference/gmrepo/release-sources/2026-10-15-v1/wgs-author-record.json"
RUN_BATCH = BACKEND_ROOT.parent / "ADMetaData/reference/gmrepo/release-sources/2026-10-15-v4"


def load() -> tuple[dict, str]:
    # Verify files before every use, including cached parsed content.
    manifest = (ROOT / "manifest.json").read_bytes()
    content = None
    for item in json.loads(manifest)["files"]:
        path = (ROOT / item["path"]).resolve()
        if not path.is_relative_to(ROOT.resolve()):
            raise ValueError("WGS path escapes reference root")
        raw = path.read_bytes()
        if len(raw) != item["bytes"] or hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise ValueError("WGS source integrity failure")
        if item["path"] == "reference.json":
            content = raw
    if content is None:
        raise ValueError("WGS normalized reference missing")
    data = _parsed(content)
    author_record = AUTHOR_RECORD.read_bytes()
    author_checksums = {r["key"]: r for r in json.loads(author_record)["files"]}
    for receipt in data["sourceReceipts"]:
        path = (AUTHOR_FILES / receipt["file"]).resolve()
        if not path.is_relative_to(AUTHOR_FILES.resolve()):
            raise ValueError("Author path escapes archive")
        raw = path.read_bytes()
        declared = author_checksums[receipt["file"]]
        if len(raw) != receipt["bytes"] or len(raw) != declared["size"] or hashlib.sha256(raw).hexdigest() != receipt["sha256"] or "md5:" + hashlib.md5(raw).hexdigest() != declared["checksum"]:
            raise ValueError("Original author archive checksum failure")
    return data, hashlib.sha256(manifest + author_record).hexdigest()


@lru_cache(maxsize=2)
def _parsed(raw: bytes) -> dict:
    data = json.loads(raw)
    if data["sourceProvider"] != "original_study" or data["clinicalComparison"] != "preclinical_AD_vs_biomarker_negative_CN" or data["inferenceStatus"] != "descriptive_only":
        raise ValueError("Unsupported WGS contract")
    return data


def catalog(query: str = "", level: str = "genus") -> dict:
    data, fingerprint = load()
    features = [{k: f[k] for k in ("featureId", "name", "level", "clade", "sourceTaxonPath")} for f in data["features"] if f["level"] == level and query.casefold() in f["name"].casefold()]
    return {k: data[k] for k in ("projectId", "sourceProvider", "platform", "processingVersion", "title", "studyUrl", "sourceUrl", "unit", "clinicalComparison", "scientificReviewStatus", "inferenceStatus", "limits")} | {
        "fingerprint": fingerprint, "sampleCount": len(data["samples"]), "groupCounts": {g: sum(s["group"] == g for s in data["samples"]) for g in ("preclinical_AD", "biomarker_negative_CN")},
        "featureCounts": {level: sum(f["level"] == level for f in data["features"]) for level in ("genus", "species")}, "total": len(features), "items": features[:100],
        "excludedProfileOnlyCount": len(data["excludedProfileOnlyIds"]), "sourceReceipts": data["sourceReceipts"], "extraction": data["extraction"],
        "access": {"accessRight": "open", "declaredLicense": json.loads(AUTHOR_RECORD.read_bytes())["metadata"]["license"]["id"],
                   "note": "公开下载不等于具体再分发条件已核清；本轮未作外部公开发布或商业再分发。"}}


def distribution(feature_id: str, revision: str) -> dict:
    data, fingerprint = load()
    if revision != fingerprint:
        raise ValueError("WGS 版本已变化，不能混用当前图与旧评估。")
    feature = next((f for f in data["features"] if f["featureId"] == feature_id), None)
    if feature is None:
        raise ValueError("WGS 特征不存在")
    groups = []
    for group in ("preclinical_AD", "biomarker_negative_CN"):
        points = [{"participantId": s["participantId"], "value": feature["values"][s["participantId"]]} for s in data["samples"] if s["group"] == group]
        values = [p["value"] for p in points]
        groups.append({"group": group, "count": len(points), "detected": sum(v > 0 for v in values), "median": statistics.median(values), "points": points})
    return {"fingerprint": fingerprint, "projectId": data["projectId"], "sourceProvider": "original_study", "unit": data["unit"],
            "feature": {k: v for k, v in feature.items() if k != "values"}, "groups": groups, "statistic": None, "note": "原研究直接来源的临床前阶段描述；不混入 AD/NC、不合并效应、不产生 WGS p/q 或独立验证结论。"}


def object_background(genus_name: str) -> dict:
    try:
        meta = catalog(genus_name, "genus")
        exact = [f for f in meta["items"] if f["name"].casefold() == genus_name.casefold()]
        return {"status": "descriptive_background" if len(exact) == 1 else "no_exact_source_genus_match", "catalog": meta,
                "distribution": distribution(exact[0]["featureId"], meta["fingerprint"]) if len(exact) == 1 else None,
                "mappingMethod": "原研究 MetaPhlAn3 属名称精确对应，仅作背景；未认证跨分类版本等价或主外数值复现。"}
    except (OSError, ValueError, KeyError):
        return {"status": "unavailable", "distribution": None, "note": "扩展 WGS 原件不可校验；未替换 GMrepo 或默认菌属。"}


def relationship_scope() -> dict:
    data, fingerprint = load()
    run_raw = (RUN_BATCH / "PRJNA798058-runs.tsv").read_bytes()
    receipt = next(r["receipt"] for r in json.loads((RUN_BATCH / "receipts.json").read_bytes())["records"] if r.get("projectId") == "PRJNA798058" and r.get("kind") == "run_export")
    if len(run_raw) != receipt["bytes"] or hashlib.sha256(run_raw).hexdigest() != receipt["sha256"]:
        raise ValueError("WGS project run scope not verifiable")
    rows = list(csv.DictReader(io.StringIO(run_raw.decode("utf-8-sig")), delimiter="\t"))
    return {"nodeId": "study_wgs:PRJNA798058", "fingerprint": hashlib.sha256((fingerprint + receipt["sha256"]).encode()).hexdigest(), "kind": "original_study_WGS",
            "runs": {r["run_accession"] for r in rows}, "specimens": {r["sample_accession"] for r in rows}, "participantKnown": len(data["samples"]), "records": len(data["samples"]),
            "identityScope": "作者矩阵内匿名 Participant 唯一；项目 Run 导出另列，未建立 Participant 到 Run 的逐人连接，不能按数量相同推断对应。"}
