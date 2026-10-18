"""Name-based, revision-scoped primary-data evidence. No cross-platform pooling."""
from __future__ import annotations

import json
import csv
import hashlib
import io
import sqlite3
from collections import Counter
from functools import lru_cache
from typing import Any

import pymysql
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import connect
from app.core.config import BACKEND_ROOT
from app.services.dataset_description_service import _verified_cohort

CONTEXT_PATH = BACKEND_ROOT / "metadata/gmrepo_primary_context.json"


def cohort_context() -> dict:
    """Study-reported cohort provenance, separate from participant-ID verification."""
    try:
        raw = CONTEXT_PATH.read_bytes()
        context = json.loads(raw)
        root = BACKEND_ROOT.parent.resolve()
        for source in context["sources"]:
            path = (root / source["path"]).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Source outside repository")
            content = path.read_bytes()
            if len(content) != source["bytes"] or hashlib.sha256(content).hexdigest() != source["sha256"]:
                raise ValueError("Source integrity mismatch")
        mapping = next(s for s in context["sources"] if s["sourceId"] == "primary-sample-map")
        rows = list(csv.DictReader(io.StringIO((root / mapping["path"]).read_text(encoding="utf-8-sig")), delimiter="\t"))
        ids = [r["run_accession"] for r in rows]
        if (len(ids) != len(set(ids)) or len(ids) != context["sampleCount"]
                or hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest() != context["sampleSetSha256"]
                or dict(Counter(r["stage"] for r in rows)) != context["groupCounts"]):
            raise ValueError("Primary sample scope mismatch")
        return {**context, "status": "source_bound", "fingerprint": hashlib.sha256(raw).hexdigest(),
                "participantIdsAvailable": sum(bool(r["host_subject_id_raw"]) for r in rows),
                "rowwiseParticipantVerification": False}
    except (OSError, ValueError, KeyError, TypeError, StopIteration):
        return {"status": "unavailable_or_changed", "note": "主队列说明或其来源当前不可校验，未据此确认参与者身份或跨队列独立性。"}


def _name(value: str) -> str:
    return " ".join(str(value or "").replace("_", " ").split()).casefold()


@lru_cache(maxsize=4)
def _taxonomy(revision_id: int, source_sha: str) -> tuple[dict, ...]:
    with connect() as conn:
        rows = conn.execute(
            """SELECT DISTINCT t.taxon_id, t.kingdom, t.genus, t.species, t.full_taxonomy
               FROM revision_species_abundance a JOIN taxon_anno t ON t.taxon_id = a.taxon_id
               WHERE a.revision_id = ? ORDER BY t.taxon_id""", (revision_id,),
        ).fetchall()
    return tuple(dict(r) for r in rows)


def primary_evidence(genus: dict[str, Any], revision: str = "", dataset_slug: str = "ad-nc-species") -> dict:
    result: dict[str, Any] = {"status": "unavailable", "datasetSlug": dataset_slug, "datasetRevision": None, "sourceSha256": None,
              "abundanceScale": None, "normalization": None, "sampleCount": None, "groupCounts": {}, "cohortId": None,
              "platform": "项目宏基因组物种矩阵", "matchMethod": "当前属名与已核对来源旧名的精确名称匹配；同时要求细菌/古菌域一致。内部 taxon_id 不是 NCBI TaxID。",
              "matchedFeatureCount": 0, "speciesPreview": [], "quantitativeStatus": "blocked", "reasons": [],
              "comparisonNote": "分类覆盖可提示下一步研究方向；物种列的存在不代表属级 AD/NC 差异已复现。"}
    try:
        with connect() as conn:
            if revision:
                row = conn.execute(
                    """SELECT r.id, r.revision_key, r.source_sha256, r.abundance_scale, r.normalization
                       FROM datasets d JOIN dataset_revisions r ON r.dataset_id = d.id
                       WHERE d.slug = ? AND d.status = 'published' AND r.status = 'published' AND r.revision_key = ?""",
                    (dataset_slug, revision),
                ).fetchone()
            else:
                row = conn.execute(
                    """SELECT r.id, r.revision_key, r.source_sha256, r.abundance_scale, r.normalization
                       FROM datasets d JOIN dataset_revisions r ON r.id = d.current_revision_id
                       WHERE d.slug = ? AND d.status = 'published' AND r.status = 'published'""", (dataset_slug,),
                ).fetchone()
            if row is None:
                result["reasons"] = ["当前没有发布的主物种数据版本。"]
                return result
            samples = conn.execute("SELECT sample_code, phenotype FROM revision_sample_info WHERE revision_id = ?", (row["id"],)).fetchall()
        groups: dict[str, int] = {}
        for sample in samples:
            groups[sample["phenotype"]] = groups.get(sample["phenotype"], 0) + 1
        cohort = _verified_cohort([s["sample_code"] for s in samples], groups)
        taxa = _taxonomy(int(row["id"]), row["source_sha256"])
        names = {_name(genus["name"]), *(_name(n) for n in genus["sourceNames"])}
        matched = [t for t in taxa if _name(t["genus"]) in names and t["kingdom"] == genus["domain"] and t["species"]]
        result.update({"status": "available", "datasetRevision": row["revision_key"], "sourceSha256": row["source_sha256"],
                       "abundanceScale": row["abundance_scale"], "normalization": row["normalization"], "sampleCount": len(samples),
                       "groupCounts": groups, "cohortId": cohort.get("cohortId") if cohort else None,
                       "matchedFeatureCount": len(matched), "speciesPreview": [{"featureId": str(t["taxon_id"]), "name": t["species"].replace("_", " "),
                                                                                 "sourceGenus": t["genus"].replace("_", " ")} for t in matched[:20]]})
        context = cohort_context()
        if cohort and context.get("cohortId") == cohort["cohortId"] and context.get("groupCounts") == groups:
            result["cohortEvidence"] = context
        else:
            result["cohortEvidence"] = {"status": "not_bound_to_matrix", "note": "当前矩阵未绑定这份主队列来源说明。"}
        if row["abundance_scale"] in {None, "", "unknown"} or row["normalization"] in {None, "", "unknown"}:
            result["reasons"].append("主矩阵丰度单位或标准化方法仍为 unknown，暂不重算跨数据集丰度/效应对照。")
        if not cohort:
            result["reasons"].append("主矩阵样本集合与已核实队列登记不符，来源需重新审查。")
        if result["cohortEvidence"]["status"] == "source_bound":
            result["reasons"].append("已有原研究人数及样本分组依据；公开资料缺少逐人 ID，重复采样未逐人验证，主外队列的受试者重叠也未排除。")
        else:
            result["reasons"].append("主矩阵的受试者来源说明尚未与当前样本范围绑定。")
        result["reasons"].append("16S 属级与宏基因组物种级处理流程不同；同属结果可以并列参考，不能解释为物种/MAG 或独立跨队列验证。")
        if result["cohortEvidence"]["status"] == "source_bound":
            from app.services.gmrepo_primary_genus import selected, snapshot

            try:
                derivative = snapshot(row["revision_key"], dataset_slug)
                result["genusComparison"] = selected(derivative, genus)
                result["quantitativeStatus"] = result["genusComparison"]["status"]
            except (OSError, ValueError, KeyError, TypeError) as exc:
                result["genusComparison"] = {"status": "unavailable", "note": str(exc), "statistic": None}
        return result
    except (SQLAlchemyError, pymysql.MySQLError, sqlite3.DatabaseError, OSError, ValueError, TypeError, json.JSONDecodeError):
        result["reasons"] = ["主物种数据当前不可读取；GMrepo 分布和队列内检验仍可使用。"]
        return result
