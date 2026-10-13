"""Read-only, versioned GMrepo reference package, isolated from primary analyses."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import BACKEND_ROOT, SETTINGS

FILES = (
    "data_contract.json", "quality_checks.json", "validation_readback.json", "cohort_rules.json",
    "tables/sample_metadata_clean.json", "tables/taxonomy_mapping.json", "tables/genus_abundance_long.tsv",
)
DECISIONS = {
    "plot_ready": "属级图表可用",
    "no_genus": "AD/NC 已核对，属级信息不足",
    "stage_reference": "阶段参考",
    "pending": "分组或身份待核查",
    "source_unavailable": "源端缺少完整丰度",
    "no_profile": "质控未通过或未加载",
}
GROUP_LABELS = {"AD": "AD", "NC": "NC", "MCI": "MCI", "at_risk": "风险组",
                "cognitively_normal_amyloid_status_unresolved": "临床前研究（Aβ 状态待核对）",
                "unresolved": "分组待核查", "other": "其他阶段"}
SCOPES = {"all": "全部元数据", "complete": "有完整丰度", "plot_ready": "属级图表可用 AD/NC",
          "group_confirmed": "分组已核对 AD/NC", "stage_reference": "阶段参考", "pending": "待核查", "no_profile": "没有完整丰度"}
REASONS = {
    "sample_annotation_matches_curated_label": "原样本疾病记录与 GMrepo 样本标注相符。",
    "specimen_alias_matches_curated_label_and_original_cohort": "登记样本别名、GMrepo 样本标注和原研究队列相符。",
    "experiment_alias_matches_per_run_source_phenotype_and_original_cohort": "实验别名与该 Run 来源表型相符；原研究为 AD/对照队列。",
    "original_author_metadata_exact_sample_alias_join": "精确对应作者公开的粪便样本记录，按原研究疾病阶段分组。",
    "cohort_preclinical_design_confirmed_individual_amyloid_status_unavailable": "原研究为认知正常 Aβ+/Aβ− 人群；个体 Aβ 状态对应尚未取得。",
    "AD_MCI_SCD_original_sample_labels_unavailable": "原研究混合 AD、MCI 与 SCD，缺少可连接的样本级临床分组。",
    "GMrepo_all_AD_conflicts_with_original_AD21_NC44_individual_mapping_unavailable": "来源全体 AD 标签与原研究 21 AD/44 NC 不符，个体分组对应待核对。",
    "AD_and_MCI_merged_in_source_sample_annotation": "原样本 Alzheimer 标签混合 AD 与 MCI，疾病阶段待核对。",
}


class GmrepoDataError(Exception):
    def __init__(self, message: str, code: str = "gmrepo_unavailable") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ReferenceDataset:
    fingerprint: str
    contract: dict[str, Any]
    checks: dict[str, Any]
    rules: dict[str, Any]
    samples: tuple[dict[str, Any], ...]
    genera: dict[str, dict[str, Any]]
    abundance: dict[tuple[str, str], dict[str, float]]
    root: Path | None = None


def load_reference_dataset(root: Path | None = None) -> ReferenceDataset:
    configured = root or SETTINGS.gmrepo_data_root
    resolved = configured if configured.is_absolute() else BACKEND_ROOT.parent / configured
    try:
        manifest = (resolved / "processing_manifest.json").read_bytes()
        return _load_package(str(resolved.resolve()), hashlib.sha256(manifest).hexdigest(), manifest)
    except GmrepoDataError:
        raise
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise GmrepoDataError("GMrepo 参考数据暂不可用，请检查参考数据接入状态。") from exc


@lru_cache(maxsize=2)
def _load_package(root_path: str, fingerprint: str, manifest_bytes: bytes) -> ReferenceDataset:
    root = Path(root_path)
    manifest = json.loads(manifest_bytes)
    entries = {r["path"]: r for r in manifest["files"]}
    content: dict[str, Any] = {}
    for relative in FILES:
        raw = (root / relative).read_bytes()
        expected = entries[relative]
        if len(raw) != expected["bytes"] or hashlib.sha256(raw).hexdigest() != expected["sha256"]:
            raise GmrepoDataError("GMrepo 数据完整性校验失败，请恢复已验证的处理版本。", "gmrepo_integrity_error")
        content[relative] = json.loads(raw) if relative.endswith(".json") else raw.decode("utf-8-sig")
    checks = content["quality_checks.json"]
    if not checks["checks_passed"] or not content["validation_readback.json"]["all_checks_passed"]:
        raise ValueError("Unvalidated reference package")
    samples = content["tables/sample_metadata_clean.json"]
    keys = {(s["project_id"], s["run_id"]) for s in samples}
    if len(keys) != len(samples) or len(samples) != checks["metadata_runs"]:
        raise ValueError("Invalid sample grain")
    genera: dict[str, dict[str, Any]] = {}
    for row in content["tables/taxonomy_mapping.json"]:
        if not row["genus_eligible"]:
            continue
        if row["current_rank"] != "genus" or row["current_domain"] not in {"Bacteria", "Archaea"}:
            raise ValueError("Invalid reference genus")
        fid = row["feature_id"]
        entry = genera.setdefault(fid, {"featureId": fid, "name": row["current_name"], "domain": row["current_domain"],
                                        "sourceTaxonIds": [], "sourceNames": []})
        entry["sourceTaxonIds"].append(row["source_taxon_id"])
        entry["sourceNames"].append(row["source_name"])
    if len(genera) != checks["confirmed_current_target_genus_features"]:
        raise ValueError("Genus count mismatch")
    abundance: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)
    for row in csv.DictReader(content["tables/genus_abundance_long.tsv"].splitlines(), delimiter="\t"):
        key = row["project_id"], row["run_id"]
        fid = row["feature_id"]
        value = float(row["relative_abundance_percent"])
        if key not in keys or fid not in genera or fid in abundance[key] or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError("Invalid abundance key or value")
        abundance[key][fid] = value
    complete = 0
    plot_ready = 0
    for sample in samples:
        key = sample["project_id"], sample["run_id"]
        if sample["profile_status"] == "complete_profile":
            complete += 1
            resolved = sample["confirmed_target_genus_percent"]
            unresolved = sample["unresolved_at_genus_percent"]
            if not all(isinstance(v, (float, int)) and math.isfinite(v) and -1e-8 <= v <= 100 + 1e-8 for v in (resolved, unresolved)):
                raise ValueError("Invalid resolution proportions")
            if abs(resolved + unresolved - 100) > 1e-8 or abs(sum(abundance.get(key, {}).values()) - resolved) > 1e-8:
                raise ValueError("Mass balance mismatch")
            if sample["genus_plot_status"] == "eligible_with_resolution_annotation":
                if sample["research_group"] not in {"AD", "NC"} or sample["analysis_decision"] != "group_confirmed_ad_nc" or resolved <= 1e-10:
                    raise ValueError("Invalid plot-ready record")
                plot_ready += 1
        elif key in abundance:
            raise ValueError("Abundance for absent profile")
    if complete != checks["complete_profiles"] or plot_ready != checks["plot_ready_ad_nc_runs"]:
        raise ValueError("Profile/plot-ready count mismatch")
    return ReferenceDataset(fingerprint, content["data_contract.json"], checks, content["cohort_rules.json"],
                            tuple(samples), genera, dict(abundance), root)


def decision(sample: dict[str, Any]) -> str:
    if sample["profile_status"] == "source_profile_unavailable":
        return "source_unavailable"
    if sample["profile_status"] != "complete_profile":
        return "no_profile"
    if sample["analysis_decision"] == "stage_reference":
        return "stage_reference"
    if sample["analysis_decision"].startswith("pending_"):
        return "pending"
    return "plot_ready" if sample["genus_plot_status"] == "eligible_with_resolution_annotation" else "no_genus"


def provenance(data: ReferenceDataset) -> dict[str, Any]:
    return {"version": data.contract["version"], "inputSnapshot": data.contract["input_snapshot"],
            "fingerprint": data.fingerprint, "processedAt": data.checks["processed_at_utc"],
            "metadataTotal": len(data.samples), "profileTotal": data.checks["complete_profiles"], "genusTotal": len(data.genera),
            "observationUnit": "sequencing_Run", "purpose": "within_cohort_descriptive_reference",
            "sources": [{"label": "GMrepo AD 来源", "url": "https://gmrepo.humangut.info/phenotypes/D000544"},
                        {"label": "ENA 样本记录", "url": "https://www.ebi.ac.uk/ena/browser/home"},
                        {"label": "NCBI 分类注释", "url": "https://www.ncbi.nlm.nih.gov/taxonomy"},
                        {"label": "PRJEB59009 作者数据", "url": "https://github.com/trocialba/Alzheimer-Project"}]}


def select_samples(data: ReferenceDataset, cohort: str = "", group: str = "", scope: str = "all") -> list[dict[str, Any]]:
    if cohort and cohort not in {s["project_id"] for s in data.samples}:
        raise ValueError("未找到该参考队列。")
    selected = []
    for sample in data.samples:
        if cohort and sample["project_id"] != cohort or group and sample["research_group"] != group:
            continue
        key = decision(sample)
        matches = {"all": True, "complete": sample["profile_status"] == "complete_profile", "plot_ready": key == "plot_ready",
                   "group_confirmed": sample["analysis_decision"] == "group_confirmed_ad_nc",
                   "stage_reference": key == "stage_reference", "pending": key == "pending", "no_profile": key in {"no_profile", "source_unavailable"}}
        if matches[scope]:
            selected.append(sample)
    return selected


def counts(samples: list[dict[str, Any]]) -> dict[str, int]:
    decisions = Counter(decision(s) for s in samples)
    groups = Counter(s["research_group"] for s in samples if decision(s) == "plot_ready")
    return {"selectedRuns": len(samples), "completeProfiles": sum(s["profile_status"] == "complete_profile" for s in samples),
            "groupConfirmedRuns": sum(s["analysis_decision"] == "group_confirmed_ad_nc" for s in samples),
            "plotReadyRuns": decisions["plot_ready"], "adRuns": groups["AD"], "ncRuns": groups["NC"],
            "stageReferenceRuns": decisions["stage_reference"], "pendingRuns": decisions["pending"],
            "noProfileRuns": decisions["no_profile"] + decisions["source_unavailable"],
            "noResolvedGenusRuns": sum(s["genus_plot_status"] == "exclude_no_confirmed_target_genus" for s in samples)}


def cohort_rows(data: ReferenceDataset, samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sample in samples:
        grouped[sample["project_id"]].append(sample)
    result = []
    for project, selected in sorted(grouped.items()):
        total = counts(selected)
        percentages = [s["unresolved_at_genus_percent"] for s in selected if s["profile_status"] == "complete_profile"]
        result.append({"projectId": project, "metadataRuns": len(selected), "completeProfiles": total["completeProfiles"],
                       "groupConfirmedRuns": total["groupConfirmedRuns"], "plotReadyRuns": total["plotReadyRuns"],
                       "adRuns": total["adRuns"], "ncRuns": total["ncRuns"], "stageReferenceRuns": total["stageReferenceRuns"],
                       "pendingRuns": total["pendingRuns"], "noProfileRuns": total["noProfileRuns"],
                       "noResolvedGenusRuns": total["noResolvedGenusRuns"],
                       "unresolvedMedianPercent": statistics.median(percentages) if percentages else None,
                       "originalStudyUrl": data.rules.get(project, {}).get("original_study")})
    return result


def catalog(data: ReferenceDataset) -> dict[str, Any]:
    present = {s["research_group"] for s in data.samples}
    return {"provenance": provenance(data), "cohorts": cohort_rows(data, list(data.samples)),
            "groups": [{"value": group, "label": label} for group, label in GROUP_LABELS.items() if group in present],
            "scopes": [{"value": value, "label": label} for value, label in SCOPES.items()]}


def overview(data: ReferenceDataset, cohort: str, group: str, scope: str) -> dict[str, Any]:
    selected = select_samples(data, cohort, group, scope)
    complete = [s for s in selected if s["profile_status"] == "complete_profile"]
    age_unknown = sum(s["age_years"] is None for s in complete)
    sex_unknown = sum(s["sex"] == "unknown" for s in complete)
    intervals = sum(s["age_parse_status"] == "unparsed_value_preserved" and "+" in str(s["age_raw"]) for s in complete)
    codes = sum(s["sex"] == "unknown" and bool(s["author_sex_code_unmapped"]) for s in complete)
    missingness = []
    for field, label, unknown, interval, code in [("age", "年龄无精确数值", age_unknown, intervals, 0), ("sex", "性别未知或未解码", sex_unknown, 0, codes)]:
        missingness.append({"field": field, "label": label, "denominator": len(complete), "knownCount": len(complete) - unknown,
                            "unavailableCount": unknown, "unavailablePercent": unknown / len(complete) * 100 if complete else None,
                            "intervalCount": interval, "unmappedCodeCount": code})
    cohorts = cohort_rows(data, selected)
    decisions = Counter(decision(s) for s in selected)
    return {"provenance": provenance(data), "selection": {"cohort": cohort, "group": group, "scope": scope}, "counts": counts(selected),
            "cohorts": cohorts, "decisions": [{"key": key, "label": label, "count": decisions[key]} for key, label in DECISIONS.items()],
            "missingness": missingness,
            "resolution": [{"projectId": c["projectId"], "profileCount": c["completeProfiles"],
                            "medianUnresolvedPercent": c["unresolvedMedianPercent"], "noResolvedGenusCount": c["noResolvedGenusRuns"]}
                           for c in cohorts if c["completeProfiles"]]}


def genus_page(data: ReferenceDataset, query: str) -> dict[str, Any]:
    needle = query.strip().casefold()
    items = sorted((g for g in data.genera.values() if not needle or any(needle in str(v).casefold() for v in
                   [g["featureId"], g["name"], *g["sourceNames"], *g["sourceTaxonIds"]])), key=lambda g: (g["name"].casefold(), g["featureId"]))
    return {"provenance": provenance(data), "total": len(items), "items": items}


def sample_page(data: ReferenceDataset, cohort: str, group: str, scope: str, genus: str, limit: int, offset: int) -> dict[str, Any]:
    if genus and genus not in data.genera:
        raise ValueError("未找到可确认的目标菌属，请从当前属级目录选择。")
    selected = select_samples(data, cohort, group, scope)
    selected.sort(key=lambda s: (list(DECISIONS).index(decision(s)), s["project_id"], s["run_id"]))
    items = []
    for sample in selected[offset:offset + limit]:
        key = decision(sample)
        identity = sample["identity_status"]
        identity_note = "有研究内受试者编号。" if identity == "explicit_study_scoped_participant_id" else (
            "登记 BioSample 共用；以实验别名区分，独立受试者关系仍需核对。" if identity == "distinct_source_experiment_alias_shared_registered_biosample"
            else "目前有样本编号，独立受试者关系尚未确认。")
        reason = REASONS.get(sample["group_review_status"], "原研究样本级分组仍需核对。")
        if key == "no_genus":
            reason = "AD/NC 分组有依据，但该 profile 没有可确认目标属级丰度。"
        elif key == "source_unavailable":
            reason = "来源标记质控通过，但接口未返回完整丰度；没有补全零行。"
        elif key == "no_profile":
            reason = "GMrepo 质控未通过或未加载，没有完整丰度。"
        abundance = None
        if genus and sample["profile_status"] == "complete_profile" and sample["confirmed_target_genus_percent"] > 1e-10:
            abundance = data.abundance.get((sample["project_id"], sample["run_id"]), {}).get(genus, 0.0)
        items.append({"projectId": sample["project_id"], "runId": sample["run_id"], "specimenId": sample["study_specimen_id"] or None,
                      "biosampleAccession": sample["biosample_accession"], "researchGroup": sample["research_group"],
                      "sourceGroup": sample["gmrepo_candidate_group"], "decisionKey": key, "decisionLabel": DECISIONS[key], "reason": reason,
                      "groupReviewStatus": sample["group_review_status"], "profileStatus": sample["profile_status"],
                      "ageYears": sample["age_years"], "ageRaw": str(sample["age_raw"]) if sample["age_raw"] is not None else None,
                      "sex": sample["sex"], "sourceSexCode": sample["author_sex_code_unmapped"] or None, "bmi": sample["bmi"],
                      "unresolvedPercent": sample["unresolved_at_genus_percent"], "resolvedGenusPercent": sample["confirmed_target_genus_percent"],
                      "identityStatus": identity, "identityNote": identity_note, "originalStudyUrl": sample["cohort_original_study"] or None,
                      "evidenceFiles": sample["group_evidence_paths"], "genusAbundancePercent": abundance})
    return {"provenance": provenance(data), "selection": {"cohort": cohort, "group": group, "scope": scope},
            "genus": data.genera.get(genus), "total": len(selected), "limit": limit, "offset": offset, "items": items}
