"""Cohort-local exploratory inference with audited participants and fixed FDR families."""
from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, OrderedDict
from copy import deepcopy
from functools import lru_cache
from threading import RLock
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu, rankdata
from statsmodels.regression.linear_model import OLS

from app.compute.charts.boxplot import _box_summary
from app.compute.statistics import benjamini_hochberg, rank_biserial_from_u
from app.core.config import BACKEND_ROOT
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference

REVIEW_PATH = BACKEND_ROOT / "metadata" / "gmrepo_inference_review.json"
METHOD_VERSION = "2026-10-12-rank-hc3-v1"
MIN_GROUP_SIZE = 10
_STATISTICS_CACHE: OrderedDict[str, dict] = OrderedDict()
_STATISTICS_LOCK = RLock()
METHODS: dict[str, Any] = {
    "version": METHOD_VERSION,
    "unadjusted": "Mann–Whitney U，双侧、渐近法、并列秩与连续性校正；秩二列相关正值表示 AD 倾向更高。",
    "adjusted": "完整协变量样本内的丰度百分位秩 ~ AD 指示 + 中心化年龄 + 性别类别；OLS、HC3 标准误、t 推断及 95% CI。系数是百分位秩点差，不是丰度百分点。",
    "fdr": "每个队列、每种模型分别对完整目标菌属目录做 Benjamini–Hochberg 校正。常量属以 p=1 进入校正；无法估计的模型也以 1 进入校正，但不展示虚构的 p/q。检索、分页、选属不改变检验族。",
    "limits": ["相对丰度只反映群落内部的比例差异，不能证明绝对菌量变化。", "结果是探索性研究线索；HC3 不解决组成约束、未测混杂或年龄的非线性关系。",
               "零值保留；不合并队列、不补缺失 profile、不把测序 Run 自动当作独立受试者。", "调整前后样本可能不同；BMI、药物、饮食等协变量未在所有队列可靠取得。",
               "AD/NC 完全无目标属信息的 profile 已在处理版本中排除；排除可能造成选择偏倚。"],
    "sources": [
        {"label": "SciPy Mann–Whitney U", "url": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html"},
        {"label": "statsmodels OLS / HC3", "url": "https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.OLSResults.get_robustcov_results.html"},
        {"label": "微生物组组成数据的解释边界", "url": "https://www.nature.com/articles/s41467-019-10656-5"},
    ],
}


def _review(data: reference.ReferenceDataset, cohort: str, samples: list[dict]) -> tuple[dict, str]:
    try:
        raw = REVIEW_PATH.read_bytes()
        payload = json.loads(raw)
        entry = payload.get("cohorts", {}).get(cohort, {})
        digest = hashlib.sha256("\n".join(sorted(s["run_id"] for s in samples)).encode()).hexdigest()
        if payload.get("referenceFingerprint") != data.fingerprint or entry.get("allRunSetSha256") != digest:
            return {}, "missing_or_version_mismatch"
        # Review evidence is also verified against the immutable processing manifest.
        if data.root is None:
            return {}, "evidence_unavailable"
        manifest = json.loads((data.root / "processing_manifest.json").read_bytes())
        entries = {r["path"]: r for r in manifest["files"]}
        for file in entry.get("evidence", []):
            source = (data.root / file).read_bytes()
            expected = entries[file]
            if len(source) != expected["bytes"] or hashlib.sha256(source).hexdigest() != expected["sha256"]:
                return {}, "evidence_integrity_error"
        return {**entry, "reviewVersion": payload.get("version")}, hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError, KeyError, TypeError):
        return {}, "evidence_unavailable"


def _sex_value(sample: dict, entry: dict) -> str | None:
    if entry.get("sexMode") == "author_code":
        value = str(sample.get("author_sex_code_unmapped") or "")
        return value if value in entry.get("allowedSexCodes", []) else None
    return sample["sex"] if sample["sex"] in {"female", "male"} else None


def _design(samples: list[dict], entry: dict) -> tuple[np.ndarray, list[str]]:
    age = np.asarray([s["age_years"] for s in samples], dtype=float)
    sex = [_sex_value(s, entry) for s in samples]
    categories = sorted(s for s in set(sex) if s is not None)
    columns = [np.ones(len(samples)), np.asarray([s["research_group"] == "AD" for s in samples], dtype=float),
               (age - age.mean()) / 10]
    names = ["intercept", "AD_vs_NC", "centered_age_per_10_years"]
    for category in categories[1:]:
        columns.append(np.asarray([s == category for s in sex], dtype=float))
        names.append(f"sex_category_{category}_vs_{categories[0]}")
    return np.column_stack(columns), names


def cohort_audit(data: reference.ReferenceDataset, cohort: str) -> dict[str, Any]:
    if not cohort:
        raise ValueError("分布与检验必须选择一个队列。")
    all_samples = reference.select_samples(data, cohort)
    samples = reference.select_samples(data, cohort, scope="plot_ready")
    if not samples:
        raise ValueError("该队列没有属级图表可用的 AD/NC 记录。")
    entry, review_status = _review(data, cohort, all_samples)
    participants = Counter(str(s.get("participant_id")) for s in all_samples if s.get("participant_id"))
    known = sum(s.get("identity_status") == "explicit_study_scoped_participant_id" and bool(s.get("participant_id")) for s in all_samples)
    repeats = sum(n > 1 for n in participants.values())
    group_counts = Counter(s["research_group"] for s in samples)
    confirmed = [s for s in all_samples if s["research_group"] in {"AD", "NC"} and s["analysis_decision"] == "group_confirmed_ad_nc"]
    issues = []

    def hold(code, message, missing, action, affects=None):
        issues.append(ledger.blocker(cohort, code, message, affects or ["unadjusted", "adjusted"], missing, action,
                                     entry.get("evidence", [])))

    supplemental_identity = ledger.effective_opinion(data, cohort, "identity")
    if not entry.get("identityReviewed") and not (supplemental_identity and supplemental_identity["decision"] == "confirmed"):
        hold("IDENTITY_REVIEW_REQUIRED", "缺少与当前数据版本相符的受试者身份审查；样本别名或 BioSample 不能替代独立参与者编号。",
             "绑定参考版本与全部 Run 集合的有效身份依据", "核对原研究参与者映射与依据文件完整性，完成专项审查。")
    if known != len(all_samples):
        hold("PARTICIPANT_ID_MISSING", "部分测序记录没有明确的研究内受试者编号，不能确认独立性。",
             "缺失记录的研究内参与者对应", "核查作者公开资料，不能用 Run 或 BioSample 编号替代参与者。")
    if repeats:
        hold("REPEATED_PARTICIPANT", "存在重复参与者编号；需核对技术重复与时间点并制定重复测量方案。",
             "重复记录的采样时间点与技术重复关系", "确定重复测量处理方案，重新发布比较范围。")
    if min(group_counts.get("AD", 0), group_counts.get("NC", 0)) < MIN_GROUP_SIZE:
        hold("GROUP_TOO_SMALL", f"任一组少于 {MIN_GROUP_SIZE} 个可用记录；当前渐近检验不执行。",
             "满足当前方法门槛的组内样本范围", "保留描述性分布；不拼接其他研究对照。")
    restrictions, registry_digest = ledger.review_restrictions(data, cohort, all_samples)
    issues.extend(restrictions)
    reasons = [i["message"] for i in issues if "unadjusted" in i["affects"]]
    complete = [s for s in samples if s["age_years"] is not None and _sex_value(s, entry) is not None]
    adjusted_groups = Counter(s["research_group"] for s in complete)
    design_info: dict[str, Any] = {"columns": [], "rank": None, "conditionNumber": None, "maxLeverage": None, "residualDf": None}
    if min(adjusted_groups.get("AD", 0), adjusted_groups.get("NC", 0)) < MIN_GROUP_SIZE:
        hold("ADJUSTED_SAMPLE_TOO_SMALL", "年龄和性别完整的任一组少于 10 人，无法进行当前协变量调整。",
             "完整且语义明确的年龄与性别资料", "核对协变量原值；不插补未知字段来获得资格。", ["adjusted"])
    elif complete:
        design, names = _design(complete, entry)
        rank = int(np.linalg.matrix_rank(design))
        inverse = np.linalg.pinv(design)
        leverage = np.sum(design * inverse.T, axis=1)
        design_info = {"columns": names, "rank": rank, "conditionNumber": float(np.linalg.cond(design)),
                       "maxLeverage": float(leverage.max()), "residualDf": len(complete) - rank}
        if rank < design.shape[1] or len(complete) - rank <= 0 or leverage.max() >= 1 - 1e-8:
            hold("DESIGN_NOT_ESTIMABLE", "协变量设计矩阵不可辨识或杠杆值达到 1，HC3 推断不能可靠估计。",
                 "可辨识且有残差自由度的设计", "复核共线性与样本分布；不输出当前调整推断。", ["adjusted"])
            if not np.isfinite(design_info["conditionNumber"]):
                design_info["conditionNumber"] = None
    covariates = []
    for group in ("AD", "NC"):
        selected = [s for s in samples if s["research_group"] == group]
        ages = [s["age_years"] for s in selected if s["age_years"] is not None]
        sex = Counter(_sex_value(s, entry) or "unknown" for s in selected)
        covariates.append({"group": group, "count": len(selected), "ageKnown": len(ages),
                           "ageMedian": float(np.median(ages)) if ages else None,
                           "ageIntervalCount": sum("+" in str(s.get("age_raw") or "") and s["age_years"] is None for s in selected),
                           "sexKnown": len(selected) - sex["unknown"], "sexCategories": dict(sex),
                           "adjustedCount": adjusted_groups[group]})
    adjusted_reasons = [i["message"] for i in issues if "adjusted" in i["affects"]]
    result = {"projectId": cohort, "metadataRuns": len(all_samples), "plotReadyRuns": len(samples), "groupCounts": dict(group_counts),
            "groupConfirmedRuns": len(confirmed), "excludedNoGenusRuns": sum(reference.decision(s) == "no_genus" for s in confirmed),
            "knownParticipantRuns": known, "uniqueKnownParticipants": len(participants), "repeatedParticipantIds": repeats,
            "identityStatus": "reviewed_unique_participants" if not reasons else "pending",
            "reviewVersion": entry.get("reviewVersion"), "reviewFingerprint": review_status,
            "reviewNote": entry.get("note", "参与者对应与重复采样关系尚待核实。"),
            "evidenceFiles": entry.get("evidence", sorted({p for s in all_samples for p in s.get("group_evidence_paths", [])})),
            "sourceUrl": entry.get("sourceUrl", data.rules.get(cohort, {}).get("original_study")),
            "sexMode": entry.get("sexMode", "decoded"), "covariates": covariates, "design": design_info,
            "unadjustedStatus": "eligible" if not reasons else "blocked", "unadjustedReasons": reasons,
            "adjustedStatus": "eligible" if not adjusted_reasons else "blocked", "adjustedReasons": adjusted_reasons,
            "adjustedCount": len(complete), "excludedMissingCovariates": len(samples) - len(complete),
            "registryFingerprint": registry_digest, "allRunSetSha256": ledger.run_set_digest(all_samples),
            "plotRunSetSha256": ledger.run_set_digest(samples), "adjustedRunSetSha256": ledger.run_set_digest(complete),
            "blockers": issues}
    return {**result, **ledger.assessment(data, cohort, result, all_samples)}


def audit_catalog(data: reference.ReferenceDataset) -> dict:
    cohorts = sorted({s["project_id"] for s in data.samples if reference.decision(s) == "plot_ready"})
    return {"provenance": reference.provenance(data), "methods": METHODS, "protocol": ledger.runtime_protocol(data),
            "items": [cohort_audit(data, c) for c in cohorts]}


def distribution(data: reference.ReferenceDataset, cohort: str, genus: str) -> dict:
    if genus not in data.genera:
        raise ValueError("请选择当前目录中可确认的目标菌属。")
    audit = cohort_audit(data, cohort)
    samples = sorted(reference.select_samples(data, cohort, scope="plot_ready"), key=lambda s: (s["research_group"], s["run_id"]))
    points = []
    boxes = []
    for s in samples:
        seed = int(hashlib.sha256(f"{cohort}:{s['run_id']}".encode()).hexdigest()[:8], 16)
        value = data.abundance[(cohort, s["run_id"])].get(genus, 0.0)
        points.append({"runId": s["run_id"], "participantId": s.get("participant_id"), "specimenId": s.get("study_specimen_id"),
                       "group": s["research_group"], "value": value, "jitter": (seed / 0xFFFFFFFF - .5) * .32,
                       "unresolvedPercent": s["unresolved_at_genus_percent"], "ageYears": s["age_years"],
                       "ageRaw": str(s.get("age_raw") or "") or None, "sex": s["sex"],
                       "sourceSexCode": str(s.get("author_sex_code_unmapped") or "") or None,
                       "readCount": s.get("source_read_count"), "qcStatus": str(s.get("source_QCStatus", "")),
                       "identityStatus": s["identity_status"]})
    for group in ("AD", "NC"):
        values = np.asarray([p["value"] for p in points if p["group"] == group])
        boxes.append({"group": group, "count": len(values), "detectedCount": int(np.count_nonzero(values)),
                      "box": _box_summary(values)["box"] if len(values) else None,
                      "logBox": _box_summary(np.log10(values + 1))["box"] if len(values) else None})
    return {"provenance": reference.provenance(data), "cohort": cohort, "genus": data.genera[genus], "audit": audit,
            "unit": "source_relative_abundance_percent", "boxes": boxes, "points": points,
            "note": "箱体为 Q1/中位数/Q3，须端为 1.5 IQR 范围内实际值；每个散点对应一个 Run，含零值与离群点。图表不受概览的单组或元数据范围筛选影响。"}


def _adjusted(values: np.ndarray, design: np.ndarray) -> dict:
    if np.ptp(values) == 0:
        return {"status": "constant", "effect": 0.0, "ciLow": None, "ciHigh": None, "pValue": 1.0, "qValue": None,
                "residualDf": len(values) - design.shape[1]}
    ranked = (rankdata(values, method="average") - .5) / len(values) * 100
    model = OLS(ranked, design).fit(cov_type="HC3", use_t=True)
    ci = model.conf_int(alpha=.05)[1]
    effect, p_value = float(model.params[1]), float(model.pvalues[1])
    if not np.isfinite([effect, p_value, *ci]).all() or model.bse[1] < 1e-10:
        return {"status": "unestimable", "effect": None, "ciLow": None, "ciHigh": None, "pValue": None, "qValue": None,
                "residualDf": int(model.df_resid)}
    return {"status": "estimated", "effect": effect, "ciLow": float(ci[0]), "ciHigh": float(ci[1]),
            "pValue": p_value, "qValue": None, "residualDf": int(model.df_resid)}


def cohort_statistics(data: reference.ReferenceDataset, cohort: str) -> dict:
    # Recheck sealed identity evidence even on a cache hit. Audit revocation must
    # never leave eligible statistics visible; return copies to protect FDR rows.
    audit = cohort_audit(data, cohort)
    samples = reference.select_samples(data, cohort)
    key = hashlib.sha256(json.dumps({
        "fingerprint": data.fingerprint, "method": METHOD_VERSION, "audit": audit,
        "samples": samples, "genera": data.genera,
        "values": {s["run_id"]: data.abundance.get((cohort, s["run_id"]), {}) for s in samples},
    }, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    with _STATISTICS_LOCK:
        if key not in _STATISTICS_CACHE:
            _STATISTICS_CACHE[key] = _compute_cohort_statistics(data, cohort, audit)
            if len(_STATISTICS_CACHE) > 16:
                _STATISTICS_CACHE.popitem(last=False)
        _STATISTICS_CACHE.move_to_end(key)
        return deepcopy(_STATISTICS_CACHE[key])


def _compute_cohort_statistics(data: reference.ReferenceDataset, cohort: str, audit: dict) -> dict:
    if audit["unadjustedStatus"] != "eligible":
        return {"provenance": reference.provenance(data), "audit": audit, "methods": METHODS,
                "familySize": len(data.genera), "total": 0, "items": [], "summary": {"unadjustedFdrCount": 0, "adjustedFdrCount": 0, "concordantFdrCount": 0}}
    samples = sorted(reference.select_samples(data, cohort, scope="plot_ready"), key=lambda s: s["run_id"])
    entry, _ = _review(data, cohort, reference.select_samples(data, cohort))
    complete_indices = [i for i, s in enumerate(samples) if s["age_years"] is not None and _sex_value(s, entry) is not None]
    adjusted_samples = [samples[i] for i in complete_indices]
    design = _design(adjusted_samples, entry)[0] if audit["adjustedStatus"] == "eligible" else None
    groups = np.asarray([s["research_group"] for s in samples])
    items: list[dict[str, Any]] = []
    for genus in sorted(data.genera.values(), key=lambda g: (g["name"].casefold(), g["featureId"])):
        values = np.asarray([data.abundance[(cohort, s["run_id"])].get(genus["featureId"], 0.0) for s in samples])
        ad, nc = values[groups == "AD"], values[groups == "NC"]
        u, p_value = (len(ad) * len(nc) / 2, 1.) if np.ptp(values) == 0 else mannwhitneyu(ad, nc, alternative="two-sided", method="asymptotic", use_continuity=True)
        adjusted = _adjusted(values[complete_indices], design) if design is not None else None
        effect = rank_biserial_from_u(float(u), len(ad), len(nc))
        items.append({"genus": genus, "adCount": len(ad), "ncCount": len(nc), "adMedianPercent": float(np.median(ad)),
                      "ncMedianPercent": float(np.median(nc)), "adDetectedPercent": float(np.count_nonzero(ad) / len(ad) * 100),
                      "ncDetectedPercent": float(np.count_nonzero(nc) / len(nc) * 100), "rankBiserial": effect,
                      "direction": "AD" if effect > 0 else "NC" if effect < 0 else "equal", "pValue": float(p_value), "qValue": None,
                      "adjusted": adjusted, "signalStatus": "not_fdr_supported"})
    q_values = benjamini_hochberg([r["pValue"] for r in items])
    adjusted_q = benjamini_hochberg([r["adjusted"]["pValue"] if r["adjusted"] and r["adjusted"]["pValue"] is not None else 1. for r in items])
    for row, q, aq in zip(items, q_values, adjusted_q, strict=True):
        row["qValue"] = float(q)
        if row["adjusted"] and row["adjusted"]["pValue"] is not None:
            row["adjusted"]["qValue"] = float(aq)
        adjusted = row["adjusted"]
        if q < .05 and adjusted and adjusted["qValue"] is not None and adjusted["qValue"] < .05:
            row["signalStatus"] = "concordant_exploratory" if row["rankBiserial"] * adjusted["effect"] > 0 else "direction_conflict"
        elif q < .05:
            row["signalStatus"] = "unadjusted_only"
        elif adjusted and adjusted["qValue"] is not None and adjusted["qValue"] < .05:
            row["signalStatus"] = "adjusted_only"
    return {"provenance": reference.provenance(data), "audit": audit, "methods": METHODS, "familySize": len(items), "total": len(items), "items": items,
            "summary": {"unadjustedFdrCount": sum(r["qValue"] < .05 for r in items),
                        "adjustedFdrCount": sum(bool(r["adjusted"] and r["adjusted"]["qValue"] is not None and r["adjusted"]["qValue"] < .05) for r in items),
                        "concordantFdrCount": sum(r["signalStatus"] == "concordant_exploratory" for r in items)}}


def statistics_page(data: reference.ReferenceDataset, cohort: str, query: str = "", limit: int = 25, offset: int = 0) -> dict:
    result = cohort_statistics(data, cohort)
    allowed = {g["featureId"] for g in reference.genus_page(data, query)["items"]}
    rows = [r for r in result["items"] if r["genus"]["featureId"] in allowed]
    # Ordering is stable and q values are always computed before query/pagination.
    result["total"] = len(rows)
    result["items"] = rows[offset:offset + limit]
    return {**result, "limit": limit, "offset": offset}


def rank_effect_interval(data: reference.ReferenceDataset, cohort: str, genus: str) -> list[float] | None:
    samples = reference.select_samples(data, cohort, scope="plot_ready")
    groups = {g: np.asarray([data.abundance[(cohort, s["run_id"])].get(genus, 0.) for s in samples if s["research_group"] == g]) for g in ("AD", "NC")}
    if min(len(v) for v in groups.values()) < MIN_GROUP_SIZE:
        return None
    seed = int(hashlib.sha256(f"{data.fingerprint}:{cohort}:{genus}:{METHOD_VERSION}".encode()).hexdigest()[:16], 16)
    return list(_rank_interval(seed, tuple(groups["AD"]), tuple(groups["NC"])))


@lru_cache(maxsize=128)
def _rank_interval(seed: int, ad_values: tuple, nc_values: tuple) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    estimates = []
    for _ in range(2000):
        ad = rng.choice(ad_values, size=len(ad_values), replace=True)
        nc = rng.choice(nc_values, size=len(nc_values), replace=True)
        pairs = ad[:, None] - nc[None, :]
        estimates.append(float(np.mean(pairs > 0) - np.mean(pairs < 0)))
    lower, upper = np.quantile(estimates, [.025, .975])
    return float(lower), float(upper)


def source_markers(data: reference.ReferenceDataset, cohort: str, genus: str) -> list[dict]:
    if data.root is None:
        raise reference.GmrepoDataError("GMrepo 证据文件暂不可用。")
    relative = "tables/source_marker_evidence.tsv"
    try:
        raw = (data.root / relative).read_bytes()
        manifest = json.loads((data.root / "processing_manifest.json").read_bytes())
        entry = next(r for r in manifest["files"] if r["path"] == relative)
        if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise reference.GmrepoDataError("GMrepo 来源证据完整性校验失败。", "gmrepo_integrity_error")
        rows = [r for r in csv.DictReader(raw.decode("utf-8-sig").splitlines(), delimiter="\t") if r["project_id"] == cohort and r["feature_id"] == genus]
        return [{"sourceTaxonId": r["source_taxon_id"], "sourceName": r["source_name"], "lda": float(r["source_lda"]),
                 "direction": r["enriched_source_group"], "comparisonStatus": r["comparison_status"], "sourceFile": r["source_response"],
                 "pureAdNc": r["comparison_status"] == "source_curated_AD_Health_comparison_not_recomputed",
                 "pValue": None, "qValue": None} for r in rows]
    except reference.GmrepoDataError:
        raise
    except (OSError, ValueError, KeyError, StopIteration) as exc:
        raise reference.GmrepoDataError("GMrepo 来源证据暂不可用。") from exc


def evidence(data: reference.ReferenceDataset, cohort: str, genus: str, source_revision: str = "", dataset_slug: str = "ad-nc-species") -> dict:
    if genus not in data.genera:
        raise ValueError("请选择当前目录中可确认的目标菌属。")
    result = cohort_statistics(data, cohort)
    row = next((r for r in result["items"] if r["genus"]["featureId"] == genus), None)
    markers = source_markers(data, cohort, genus)
    from app.services.gmrepo_primary_evidence import primary_evidence

    return {"provenance": reference.provenance(data), "cohort": cohort, "genus": data.genera[genus], "audit": result["audit"],
            "statistic": row, "rankBiserialCi": rank_effect_interval(data, cohort, genus) if row else None,
            "ciMethod": "固定种子、独立组内 2,000 次 bootstrap 的 95% 百分位区间；单个效应区间没有多重性校正。",
            "sourceMarkers": markers, "sourceNote": "来源 LDA 不等于 p/q，也不与本次效应相加。未返回 marker 不能解释为没有差异；混合疾病阶段的来源比较不可作纯 AD/NC 复现。",
            "primary": primary_evidence(data.genera[genus], source_revision, dataset_slug) if source_revision else primary_evidence(data.genera[genus])}
