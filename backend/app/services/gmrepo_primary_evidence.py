"""Name-based, revision-scoped primary-data evidence. No cross-platform pooling."""
from __future__ import annotations

import json
import sqlite3
from functools import lru_cache
from typing import Any

import pymysql
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import connect
from app.services.dataset_description_service import _verified_cohort


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


def primary_evidence(genus: dict[str, Any]) -> dict:
    result: dict[str, Any] = {"status": "unavailable", "datasetSlug": "ad-nc-species", "datasetRevision": None, "sourceSha256": None,
              "abundanceScale": None, "normalization": None, "sampleCount": None, "groupCounts": {}, "cohortId": None,
              "platform": "项目宏基因组物种矩阵", "matchMethod": "当前属名与已核对来源旧名的精确名称匹配；同时要求细菌/古菌域一致。内部 taxon_id 不是 NCBI TaxID。",
              "matchedFeatureCount": 0, "speciesPreview": [], "quantitativeStatus": "blocked", "reasons": [],
              "comparisonNote": "分类覆盖可提示下一步研究方向；物种列的存在不代表属级 AD/NC 差异已复现。"}
    try:
        with connect() as conn:
            row = conn.execute(
                """SELECT r.id, r.revision_key, r.source_sha256, r.abundance_scale, r.normalization
                   FROM datasets d JOIN dataset_revisions r ON r.id = d.current_revision_id
                   WHERE d.slug = ? AND d.status = 'published' AND r.status = 'published'""", ("ad-nc-species",),
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
        if row["abundance_scale"] in {None, "", "unknown"} or row["normalization"] in {None, "", "unknown"}:
            result["reasons"].append("主矩阵丰度单位或标准化方法仍为 unknown，暂不重算跨数据集丰度/效应对照。")
        if not cohort:
            result["reasons"].append("主矩阵样本集合与已核实队列登记不符，来源需重新审查。")
        result["reasons"].extend(["主矩阵的独立受试者对应、重复采样和年龄/性别协变量仍需接入核查。",
                                  "16S 属级与宏基因组物种级处理流程不同；需统一属级注释及分析口径后才能判定方向复现。"])
        return result
    except (SQLAlchemyError, pymysql.MySQLError, sqlite3.DatabaseError, OSError, ValueError, TypeError, json.JSONDecodeError):
        result["reasons"] = ["主物种数据当前不可读取；GMrepo 分布和队列内检验仍可使用。"]
        return result
