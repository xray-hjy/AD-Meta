"""Immutable primary genus derivation and cohort-local exploratory statistics."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import tempfile
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.stats import mannwhitneyu

from app.compute.statistics import benjamini_hochberg, rank_biserial_from_u
from app.core.config import BACKEND_ROOT, SETTINGS
from app.core.database import connect
from app.services import gmrepo_analysis_service as analysis

ROOT = SETTINGS.storage_root / "gmrepo-primary-genus"
DERIVATION = "published-species-sum-by-domain-genus-v1"


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()


def derive(samples: list[dict], abundance: list[dict], covariates: list[dict], factor: float) -> dict:
    """Aggregate each published species exactly once; no common-genus reclosure."""
    codes = [s["sample_code"] for s in samples]
    if len(codes) != len(set(codes)) or not codes:
        raise ValueError("Primary sample IDs are empty or repeated.")
    meta = {r["run_accession"]: r for r in covariates}
    if len(meta) != len(covariates) or set(codes) != set(meta):
        raise ValueError("Covariates are not bound to the exact primary sample set.")
    features, profiles = {}, defaultdict(dict)
    for row in abundance:
        code = row["sample_code"]
        if code not in meta:
            raise ValueError("Abundance sample is outside the declared cohort.")
        domain, genus = row["kingdom"], row["genus"]
        if not genus:
            genus = "UNRESOLVED_" + str(row["taxon_id"])
        key = domain + "\0" + genus
        fid = "PRIMARY-GENUS:" + hashlib.sha256(key.encode()).hexdigest()[:20]
        feature = features.setdefault(fid, {"featureId": fid, "name": genus.replace("_", " "), "domain": domain,
                                            "sourceGenus": genus, "speciesFeatureIds": []})
        taxon = str(row["taxon_id"])
        if taxon not in feature["speciesFeatureIds"]:
            feature["speciesFeatureIds"].append(taxon)
        value = float(row["abundance"]) * factor
        if not np.isfinite(value) or value < 0 or value > 100 + 1e-6:
            raise ValueError("Invalid primary abundance.")
        profiles[code][fid] = profiles[code].get(fid, 0.) + value
    totals = [sum(profiles[code].values()) for code in codes]
    if not np.allclose(totals, 100., rtol=0, atol=.01):
        raise ValueError("Published primary species matrix is incomplete or has an unsupported scale.")
    records = []
    for sample in samples:
        code = sample["sample_code"]
        source = meta[code]
        if source["stage"] != sample["phenotype"] or sample["phenotype"] not in {"AD", "NC"}:
            raise ValueError("Primary disease label conflicts with source mapping.")
        age_raw = source.get("local_age") or source.get("host_age") or ""
        try:
            age = float(age_raw) if age_raw else None
            if age is not None and (not np.isfinite(age) or not 0 <= age <= 120):
                age = None
        except ValueError:
            age = None
        sex = {"F": "female", "M": "male", "female": "female", "male": "male"}.get(source.get("local_gender") or source.get("host_sex_raw"))
        records.append({"runId": code, "participantId": source.get("host_subject_id_raw") or None, "group": sample["phenotype"],
                        "age": age, "sex": sex, "sourceBatch": source.get("local_Group"), "abundance": profiles[code]})
    for feature in features.values():
        feature["speciesFeatureIds"].sort()
    return {"features": sorted(features.values(), key=lambda f: (f["name"].casefold(), f["featureId"])), "samples": records,
            "massBalancePercent": [min(totals), max(totals)], "groupCounts": dict(Counter(s["group"] for s in records))}


def statistics(inputs: dict) -> dict:
    records, features = inputs["samples"], inputs["features"]
    groups = np.asarray([s["group"] for s in records])
    counts = Counter(groups)
    if min(counts.get("AD", 0), counts.get("NC", 0)) < analysis.MIN_GROUP_SIZE:
        raise ValueError("Insufficient primary group size.")
    complete = [i for i, s in enumerate(records) if s["age"] is not None and s["sex"] is not None]
    adjusted_counts = Counter(records[i]["group"] for i in complete)
    design = None
    design_info: dict[str, object] = {"status": "insufficient_complete_cases"}
    if min(adjusted_counts.get("AD", 0), adjusted_counts.get("NC", 0)) >= analysis.MIN_GROUP_SIZE:
        design_samples = [{"age_years": records[i]["age"], "sex": records[i]["sex"], "research_group": records[i]["group"]} for i in complete]
        candidate, names = analysis._design(design_samples, {})
        rank = int(np.linalg.matrix_rank(candidate))
        leverage = np.sum(candidate * np.linalg.pinv(candidate).T, axis=1)
        condition = float(np.linalg.cond(candidate))
        valid = rank == candidate.shape[1] and len(complete) > rank and leverage.max() < 1 - 1e-8
        design_info = {"status": "estimated" if valid else "unestimable", "rank": rank, "columns": names,
                       "conditionNumber": condition if np.isfinite(condition) else None, "maxLeverage": float(leverage.max()), "residualDf": len(complete) - rank}
        if valid:
            design = candidate
    items = []
    for feature in features:
        values = np.asarray([s["abundance"].get(feature["featureId"], 0.) for s in records])
        ad, nc = values[groups == "AD"], values[groups == "NC"]
        u, p = (len(ad) * len(nc) / 2, 1.) if np.ptp(values) == 0 else mannwhitneyu(ad, nc, alternative="two-sided", method="asymptotic", use_continuity=True)
        effect = rank_biserial_from_u(float(u), len(ad), len(nc))
        items.append({"genus": feature, "adCount": len(ad), "ncCount": len(nc), "adMedianPercent": float(np.median(ad)), "ncMedianPercent": float(np.median(nc)),
                      "adDetectedPercent": float(np.count_nonzero(ad) / len(ad) * 100), "ncDetectedPercent": float(np.count_nonzero(nc) / len(nc) * 100),
                      "rankBiserial": effect, "direction": "AD" if effect > 0 else "NC" if effect < 0 else "equal", "pValue": float(p), "qValue": None,
                      "adjusted": analysis._adjusted(values[complete], design) if design is not None else None, "signalStatus": "not_fdr_supported"})
    unadjusted_q = benjamini_hochberg([r["pValue"] for r in items])
    adjusted_q = benjamini_hochberg([r["adjusted"]["pValue"] if r["adjusted"] and r["adjusted"]["pValue"] is not None else 1. for r in items])
    for row, q, aq in zip(items, unadjusted_q, adjusted_q, strict=True):
        row["qValue"] = float(q)
        adjusted = row["adjusted"]
        if adjusted and adjusted["pValue"] is not None:
            adjusted["qValue"] = float(aq)
        if q < .05 and adjusted and adjusted["qValue"] is not None and adjusted["qValue"] < .05:
            row["signalStatus"] = "concordant_exploratory" if row["rankBiserial"] * adjusted["effect"] > 0 else "direction_conflict"
        elif q < .05:
            row["signalStatus"] = "unadjusted_only"
        elif adjusted and adjusted["qValue"] is not None and adjusted["qValue"] < .05:
            row["signalStatus"] = "adjusted_only"
    return {"familySize": len(features), "items": items, "adjustedCount": len(complete), "adjustedGroupCounts": dict(adjusted_counts), "design": design_info}


@lru_cache(maxsize=4)
def _input(revision_id: int, source_sha: str, context_fingerprint: str, factor: float, map_path: str) -> dict:
    with connect() as conn:
        samples = [dict(r) for r in conn.execute("SELECT sample_id,sample_code,phenotype FROM revision_sample_info WHERE revision_id=? ORDER BY sample_code", (revision_id,)).fetchall()]
        rows = [dict(r) for r in conn.execute("""SELECT s.sample_code,t.taxon_id,t.kingdom,t.genus,a.abundance
                 FROM revision_species_abundance a JOIN revision_sample_info s ON s.sample_id=a.sample_id AND s.revision_id=a.revision_id
                 JOIN taxon_anno t ON t.taxon_id=a.taxon_id WHERE a.revision_id=? ORDER BY s.sample_code,t.taxon_id""", (revision_id,)).fetchall()]
    source = list(csv.DictReader(io.StringIO(Path(map_path).read_text(encoding="utf-8-sig")), delimiter="\t"))
    # A duplicate species observation must never be aggregated twice.
    if len({(r["sample_code"], r["taxon_id"]) for r in rows}) != len(rows):
        raise ValueError("Duplicate published species observations.")
    result = derive(samples, rows, source, factor)
    result["sourceMatrix"] = {"samples": samples, "observations": rows, "covariates": source, "factor": factor}
    return result


def snapshot(revision: str = "", dataset_slug: str = "ad-nc-species") -> dict:
    from app.services.gmrepo_primary_evidence import cohort_context

    context = cohort_context()
    if context.get("status") != "source_bound":
        raise ValueError("Primary cohort source context is unavailable or changed.")
    with connect() as conn:
        if revision:
            row = conn.execute("""SELECT r.id,r.revision_key,r.source_sha256,r.abundance_scale,r.normalization,r.validation_json FROM dataset_revisions r JOIN datasets d ON d.id=r.dataset_id
                                  WHERE d.slug=? AND d.status='published' AND r.status='published' AND r.revision_key=?""", (dataset_slug, revision)).fetchone()
        else:
            row = conn.execute("""SELECT r.id,r.revision_key,r.source_sha256,r.abundance_scale,r.normalization,r.validation_json FROM datasets d JOIN dataset_revisions r ON r.id=d.current_revision_id
                                  WHERE d.slug=? AND d.status='published' AND r.status='published'""", (dataset_slug,)).fetchone()
    if row is None or "MetaPhlAn 4" not in (row["normalization"] or ""):
        raise ValueError("This derivation requires the published MetaPhlAn 4 species revision; no fallback to another revision.")
    factor = {"relative_abundance": 100., "relative_abundance_percent": 1., "percent": 1.}.get(row["abundance_scale"])
    if factor is None:
        raise ValueError("Unsupported or unknown primary abundance unit.")
    source = next(s for s in context["sources"] if s["sourceId"] == "primary-sample-map")
    inputs = _input(row["id"], row["source_sha256"], context["fingerprint"], factor, str(BACKEND_ROOT.parent / source["path"]))
    validation = json.loads(row["validation_json"] or "{}")
    represented = {fid for f in inputs["features"] for fid in f["speciesFeatureIds"]}
    if len(represented) != validation.get("featureCount"):
        raise ValueError("Published feature membership is incomplete (including possible all-zero features); no reduced FDR family substituted.")
    if len(inputs["samples"]) != context["sampleCount"] or inputs["groupCounts"] != context["groupCounts"]:
        raise ValueError("Derived matrix differs from the registered cohort scope.")
    sample_hash = hashlib.sha256("\n".join(sorted(s["runId"] for s in inputs["samples"])).encode()).hexdigest()
    if sample_hash != context["sampleSetSha256"]:
        raise ValueError("Derived matrix sample IDs differ from the registered cohort.")
    implementation = {name: hashlib.sha256((BACKEND_ROOT / name).read_bytes()).hexdigest() for name in ("app/services/gmrepo_primary_genus.py", "app/services/gmrepo_analysis_service.py", "app/compute/statistics.py")}
    provenance = {"sourceRevision": row["revision_key"], "sourceSha256": row["source_sha256"], "datasetSlug": dataset_slug,
                  "derivationVersion": DERIVATION, "methodVersion": analysis.METHOD_VERSION, "implementation": implementation,
                  "inputSha256": digest(inputs), "contextFingerprint": context["fingerprint"], "sampleSetSha256": sample_hash,
                  "unit": "relative_abundance_percent", "normalization": "按已发布种级矩阵的域与属求和，比例乘 100，不二次闭合；未知属保留在完整检验族。",
                  "identityBasis": "原研究人数/样本数与分组依据；本次探索性计算采用独立观测假设，未完成逐人 ID 核验或跨队列独立性认证。"}
    key = digest(provenance)
    folder = ROOT / key
    if not folder.exists():
        result = statistics(inputs)
        ROOT.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix=".primary-", dir=ROOT))
        for name, value in (("inputs.json", inputs), ("statistics.json", result)):
            (temporary / name).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False), encoding="utf-8")
        manifest = {"fingerprint": key, "provenance": provenance, "files": {n: hashlib.sha256((temporary / n).read_bytes()).hexdigest() for n in ("inputs.json", "statistics.json")}}
        (temporary / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        try:
            os.rename(temporary, folder)
        except FileExistsError:
            # Another request published identical content; validate its result below.
            for path in temporary.iterdir():
                path.unlink()
            temporary.rmdir()
    manifest = json.loads((folder / "manifest.json").read_bytes())
    if manifest["fingerprint"] != key or manifest["provenance"] != provenance:
        raise ValueError("Primary derivative provenance failed validation.")
    values = {}
    if set(manifest["files"]) != {"inputs.json", "statistics.json"}:
        raise ValueError("Missing primary derivative files.")
    for name, expected in manifest["files"].items():
        if name not in {"inputs.json", "statistics.json"}:
            raise ValueError("Unexpected derivative file.")
        raw = (folder / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError("Primary derivative integrity failure.")
        values[name] = json.loads(raw)
    return {"fingerprint": key, "provenance": provenance, "inputs": values["inputs.json"], "statistics": values["statistics.json"], "root": folder}


def selected(result: dict, genus: dict) -> dict:
    def normalize(value: str) -> str:
        return " ".join(value.replace("_", " ").split()).casefold()

    names = {normalize(genus["name"]), *(normalize(n) for n in genus["sourceNames"])}
    matches = [r for r in result["statistics"]["items"] if r["genus"]["domain"] == genus["domain"] and normalize(r["genus"]["sourceGenus"]) in names]
    if len(matches) != 1:
        return {"status": "ambiguous" if matches else "unmapped", "statistic": None, "rankBiserialCi": None,
                "fingerprint": result.get("fingerprint"), "provenance": result.get("provenance"), "familySize": result["statistics"]["familySize"],
                "note": "参考属对应多个主属或无法精确对应；未合并旧名来制造一个检验结果。"}
    row = matches[0]
    fid = row["genus"]["featureId"]
    groups = {g: tuple(s["abundance"].get(fid, 0.) for s in result["inputs"]["samples"] if s["group"] == g) for g in ("AD", "NC")}
    seed = int(hashlib.sha256(f"{result['fingerprint']}:{fid}:{analysis.METHOD_VERSION}".encode()).hexdigest()[:16], 16)
    return {"status": "exploratory_comparison", "statistic": row, "rankBiserialCi": list(analysis._rank_interval(seed, groups["AD"], groups["NC"])),
            "fingerprint": result["fingerprint"], "provenance": result["provenance"], "familySize": result["statistics"]["familySize"],
            "adjustedCount": result["statistics"]["adjustedCount"], "adjustedGroupCounts": result["statistics"]["adjustedGroupCounts"],
            "design": result["statistics"]["design"], "groups": [{"group": g, "points": [{"sampleId": s["runId"], "value": s["abundance"].get(fid, 0.)} for s in result["inputs"]["samples"] if s["group"] == g]} for g in ("AD", "NC")],
            "note": "主/外同属结果并列参考；不合并丰度、不提供独立验证票数。"}
