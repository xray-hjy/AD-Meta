"""Standalone reference calculation: numpy/scipy/statsmodels only; no app or DB imports.

Run: python replay.py /path/to/extracted-bundle
Hash checks are integrity checks, not an author signature or scientific approval.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu, rankdata
from statsmodels.regression.linear_model import OLS

ATOL = 1e-10
RTOL = 1e-8


def bh(values):
    p = np.asarray(values, dtype=float)
    order = np.argsort(p, kind="stable")
    out = np.empty(len(p))
    out[order] = np.minimum(1, np.minimum.accumulate((p[order] * len(p) / np.arange(1, len(p) + 1))[::-1])[::-1])
    return out


def calculate(cohort: dict, features: list[dict]) -> list[dict]:
    if cohort["audit"]["unadjustedStatus"] != "eligible":
        return []
    samples = cohort["samples"]
    complete = [i for i, s in enumerate(samples) if s["age"] is not None and s["sex"] is not None]
    adjusted = cohort["audit"]["adjustedStatus"] == "eligible"
    design = None
    if adjusted:
        age = np.asarray([samples[i]["age"] for i in complete], dtype=float)
        sex = [samples[i]["sex"] for i in complete]
        categories = sorted(set(sex))
        columns = [np.ones(len(complete)), np.asarray([samples[i]["group"] == "AD" for i in complete], dtype=float), (age - age.mean()) / 10]
        columns.extend(np.asarray([s == category for s in sex], dtype=float) for category in categories[1:])
        design = np.column_stack(columns)
        if np.linalg.matrix_rank(design) != design.shape[1]:
            raise ValueError("Declared adjusted design is rank deficient")
    groups = np.asarray([s["group"] for s in samples])
    rows: list[dict[str, Any]] = []
    for feature in features:
        values = np.asarray([s["abundance"].get(feature["featureId"], 0.) for s in samples])
        ad, nc = values[groups == "AD"], values[groups == "NC"]
        u, p = (len(ad) * len(nc) / 2, 1.) if np.ptp(values) == 0 else mannwhitneyu(ad, nc, alternative="two-sided", method="asymptotic", use_continuity=True)
        effect = float(np.clip(2 * u / (len(ad) * len(nc)) - 1, -1, 1))
        fit = None
        if design is not None:
            y = values[complete]
            if np.ptp(y) == 0:
                fit = {"status": "constant", "effect": 0., "ciLow": None, "ciHigh": None, "pValue": 1., "qValue": None, "residualDf": len(y) - design.shape[1]}
            else:
                model = OLS((rankdata(y, method="average") - .5) / len(y) * 100, design).fit(cov_type="HC3", use_t=True)
                lo, hi = model.conf_int(alpha=.05)[1]
                e, ap = float(model.params[1]), float(model.pvalues[1])
                fit = {"status": "estimated", "effect": e, "ciLow": float(lo), "ciHigh": float(hi), "pValue": ap, "qValue": None, "residualDf": int(model.df_resid)}
                if not np.isfinite([e, ap, lo, hi]).all() or model.bse[1] < 1e-10:
                    fit.update(status="unestimable", effect=None, ciLow=None, ciHigh=None, pValue=None)
        rows.append({"genus": feature, "adCount": len(ad), "ncCount": len(nc), "adMedianPercent": float(np.median(ad)), "ncMedianPercent": float(np.median(nc)),
                     "adDetectedPercent": float(np.count_nonzero(ad) / len(ad) * 100), "ncDetectedPercent": float(np.count_nonzero(nc) / len(nc) * 100),
                     "rankBiserial": effect, "direction": "AD" if effect > 0 else "NC" if effect < 0 else "equal", "pValue": float(p), "qValue": None,
                     "adjusted": fit, "signalStatus": "not_fdr_supported"})
    for row, q, aq in zip(rows, bh([r["pValue"] for r in rows]), bh([r["adjusted"]["pValue"] if r["adjusted"] and r["adjusted"]["pValue"] is not None else 1. for r in rows]), strict=True):
        row["qValue"] = float(q)
        a = row["adjusted"]
        if a and a["pValue"] is not None:
            a["qValue"] = float(aq)
        if q < .05 and a and a["qValue"] is not None and a["qValue"] < .05:
            row["signalStatus"] = "concordant_exploratory" if row["rankBiserial"] * a["effect"] > 0 else "direction_conflict"
        elif q < .05:
            row["signalStatus"] = "unadjusted_only"
        elif a and a["qValue"] is not None and a["qValue"] < .05:
            row["signalStatus"] = "adjusted_only"
    return rows


def compare(actual, expected, path="result"):
    if isinstance(expected, dict):
        if not isinstance(actual, dict) or set(actual) != set(expected):
            raise ValueError(f"Key mismatch: {path}")
        for k in expected:
            compare(actual[k], expected[k], f"{path}/{k}")
    elif isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            raise ValueError(f"Length mismatch: {path}")
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            compare(a, e, f"{path}/{i}")
    elif isinstance(expected, int) and not isinstance(expected, bool):
        if actual != expected:
            raise ValueError(f"Integer/count mismatch: {path}")
    elif isinstance(expected, float):
        if not isinstance(actual, (float, int)) or not math.isfinite(actual) or not math.isclose(actual, expected, rel_tol=RTOL, abs_tol=ATOL):
            raise ValueError(f"Numeric mismatch: {path}")
    elif actual != expected:
        raise ValueError(f"Value/status mismatch: {path}")


def primary_derivation(inputs):
    """Independent summation from the published species observations (not FASTQ)."""
    source = inputs["sourceMatrix"]
    profiles = {s["sample_code"]: {} for s in source["samples"]}
    features, seen = {}, set()
    for row in source["observations"]:
        key = (row["sample_code"], row["taxon_id"])
        if key in seen or key[0] not in profiles:
            raise ValueError("Duplicate or out-of-cohort primary observation")
        seen.add(key)
        genus = row["genus"] or "UNRESOLVED_" + str(row["taxon_id"])
        fid = "PRIMARY-GENUS:" + hashlib.sha256((row["kingdom"] + "\0" + genus).encode()).hexdigest()[:20]
        f = features.setdefault(fid, {"featureId": fid, "name": genus.replace("_", " "), "domain": row["kingdom"], "sourceGenus": genus, "speciesFeatureIds": []})
        if str(row["taxon_id"]) not in f["speciesFeatureIds"]:
            f["speciesFeatureIds"].append(str(row["taxon_id"]))
        value = row["abundance"] * source["factor"]
        if not math.isfinite(value) or not 0 <= value <= 100.000001:
            raise ValueError("Invalid primary observation")
        profiles[key[0]][fid] = profiles[key[0]].get(fid, 0.) + value
    for f in features.values():
        f["speciesFeatureIds"].sort()
    compare(sorted(features.values(), key=lambda f: (f["name"].casefold(), f["featureId"])), inputs["features"], "primaryFeatures")
    metadata = {r["run_accession"]: r for r in source["covariates"]}
    if len(metadata) != len(source["covariates"]) or set(metadata) != set(profiles) or set(profiles) != {s["runId"] for s in inputs["samples"]}:
        raise ValueError("Primary sample/covariate mismatch")
    source_groups = {s["sample_code"]: s["phenotype"] for s in source["samples"]}
    for s in inputs["samples"]:
        raw = metadata[s["runId"]]
        compare(profiles[s["runId"]], s["abundance"], "primaryAggregation")
        if not math.isclose(sum(s["abundance"].values()), 100, abs_tol=.01):
            raise ValueError("Primary mass conservation failure")
        compare(raw["stage"], s["group"], "primaryDisease")
        compare(source_groups[s["runId"]], s["group"], "publishedDisease")
        age_raw = raw.get("local_age") or raw.get("host_age") or ""
        try:
            age = float(age_raw) if age_raw else None
            if age is not None and (not math.isfinite(age) or not 0 <= age <= 120):
                age = None
        except ValueError:
            age = None
        compare(age, s["age"], "primaryAge")
        compare({"F": "female", "M": "male", "female": "female", "male": "male"}.get(raw.get("local_gender") or raw.get("host_sex_raw")), s["sex"], "primarySex")
        compare(raw.get("host_subject_id_raw") or None, s["participantId"], "primaryIdentity")


def interval(samples, fid, seed):
    groups = [np.asarray([s["abundance"].get(fid, 0.) for s in samples if s["group"] == g]) for g in ("AD", "NC")]
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(2000):
        a, b = (rng.choice(g, len(g), replace=True) for g in groups)
        values.append(float(np.sign(a[:, None] - b[None, :]).mean()))
    return np.quantile(values, [.025, .975]).tolist()


def verify(root: Path) -> dict:
    root = root.resolve()
    manifest = json.loads((root / "manifest.json").read_bytes())
    if manifest["schemaVersion"] != 1 or manifest["methodVersion"] != "2026-10-12-rank-hc3-v1":
        raise ValueError("Unsupported replay contract/method")
    if not {"inputs.json", "expected.json", "evaluation.json", "replay.py", "requirements.txt", "README.txt"} <= set(manifest["files"]):
        raise ValueError("Manifest is missing required replay files")
    for file, expected in manifest["files"].items():
        path = (root / file).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Bundle path escapes root")
        raw = path.read_bytes()
        if len(raw) != expected["bytes"] or hashlib.sha256(raw).hexdigest() != expected["sha256"]:
            raise ValueError(f"Integrity failure: {file}")
    inputs = json.loads((root / "inputs.json").read_bytes())
    expected = json.loads((root / "expected.json").read_bytes())
    fixed = json.loads((root / "evaluation.json").read_bytes())
    if fixed["evaluationId"] != manifest["evaluationId"]:
        raise ValueError("Evaluation ID mismatch")
    features = inputs["features"]
    if len({f["featureId"] for f in features}) != len(features) or len(features) != manifest["familySize"]:
        raise ValueError("Invalid full feature family")
    cohort_ids = [c["projectId"] for c in inputs["cohorts"]]
    if len(set(cohort_ids)) != len(cohort_ids) or set(cohort_ids) != set(expected) or set(cohort_ids) != {c["projectId"] for c in fixed["payload"]["evaluation"]["cohorts"]}:
        raise ValueError("Missing or duplicate frozen cohort")
    reports = []
    for cohort in inputs["cohorts"]:
        samples = cohort["samples"]
        if len({s["runId"] for s in samples}) != len(samples) or any(s["group"] not in {"AD", "NC"} for s in samples):
            raise ValueError("Invalid sample grain/groups")
        for sample in samples:
            if any(k not in {f["featureId"] for f in features} or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 100 for k, v in sample["abundance"].items()):
                raise ValueError("Invalid profile")
        counts = {g: sum(s["group"] == g for s in samples) for g in ("AD", "NC")}
        compare(counts, cohort["audit"]["groupCounts"], "groupCounts")
        rows = calculate(cohort, features)
        compare(rows, expected[cohort["projectId"]])
        frozen = next(r for r in fixed["payload"]["evaluation"]["cohorts"] if r["projectId"] == cohort["projectId"])
        record = fixed["payload"]["evaluation"]
        selections = record["items"] if record.get("kind") == "candidate_comparison" else [{"referenceGenus": record["genus"], "cohorts": [frozen]}]
        for candidate in selections:
            genus = candidate.get("referenceGenus")
            selected = next((r for r in rows if genus and r["genus"]["featureId"] == genus["featureId"]), None)
            archived = next(r for r in candidate["cohorts"] if r["projectId"] == cohort["projectId"])
            compare(selected, archived["statistic"], "frozenSelectedStatistic")
            if selected and archived.get("rankBiserialCi"):
                fid = selected["genus"]["featureId"]
                seed = int(hashlib.sha256(f"{manifest['referenceFingerprint']}:{cohort['projectId']}:{fid}:{manifest['methodVersion']}".encode()).hexdigest()[:16], 16)
                compare(interval(samples, fid, seed), archived["rankBiserialCi"], "externalBootstrapCI")
        reports.append({"projectId": cohort["projectId"], "groupCounts": counts, "computedFeatures": len(rows), "status": "recomputed" if rows else "descriptive_only_no_test"})
    record = fixed["payload"]["evaluation"]
    bound = record.get("primaryDerivative") or record.get("primary", {}).get("genusComparison", {})
    primary_status = {"status": "not_included"}
    if bound.get("fingerprint"):
        if not {"primary-inputs.json", "primary-expected.json"} <= set(manifest["files"]):
            raise ValueError("Missing declared primary inputs")
        main = json.loads((root / "primary-inputs.json").read_bytes())
        primary_derivation(main)
        digest = hashlib.sha256(json.dumps(main, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()
        compare(digest, bound["provenance"]["inputSha256"], "primaryInputFingerprint")
        counts = {g: sum(s["group"] == g for s in main["samples"]) for g in ("AD", "NC")}
        compare(counts, main["groupCounts"], "primaryGroupCounts")
        expected_main = json.loads((root / "primary-expected.json").read_bytes())
        rows = calculate({"samples": main["samples"], "audit": {"unadjustedStatus": "eligible", "adjustedStatus": "eligible" if expected_main["design"]["status"] == "estimated" else "blocked"}}, main["features"])
        compare(rows, expected_main["items"], "primaryFullFamily")
        choices = [c["primaryStatistic"] for c in record["items"] if c["primaryStatistic"]] if record.get("kind") == "candidate_comparison" else [bound["statistic"]] if bound.get("statistic") else []
        index = {r["genus"]["featureId"]: r for r in rows}
        for row in choices:
            compare(index[row["genus"]["featureId"]], row, "primaryFixedSelection")
        if record.get("kind") != "candidate_comparison" and bound.get("statistic"):
            fid = bound["statistic"]["genus"]["featureId"]
            seed = int(hashlib.sha256(f"{bound['fingerprint']}:{fid}:{manifest['methodVersion']}".encode()).hexdigest()[:16], 16)
            compare(interval(main["samples"], fid, seed), bound["rankBiserialCi"], "primaryBootstrapCI")
        primary_status = {"status": "species_to_genus_and_full_statistics_recomputed", "familySize": len(rows), "groupCounts": counts}
    wgs_status = "not_included"
    wgs = fixed["payload"]["evaluation"].get("wgsReference", {})
    if wgs.get("distribution"):
        if not {"wgs-participants.tsv", "wgs-profiles.tsv"} <= set(manifest["files"]):
            raise ValueError("Missing declared WGS replay inputs")
        with (root / "wgs-participants.tsv").open(encoding="utf-8-sig") as stream:
            meta = list(csv.DictReader(stream, delimiter="\t"))
        with (root / "wgs-profiles.tsv").open(encoding="utf-8-sig") as stream:
            profiles = list(csv.DictReader(stream, delimiter="\t"))
        ids = [r["Participant"] for r in meta]
        if len(set(ids)) != len(ids) or any(r["CDR"] != "0" or r["amyloid.positive.AF"] not in {"0", "1"} for r in meta):
            raise ValueError("Invalid WGS stage/participant metadata")
        profile = next(r for r in profiles if r["clade_name"] == wgs["distribution"]["feature"]["clade"])
        for frozen_group in wgs["distribution"]["groups"]:
            flag = "1" if frozen_group["group"] == "preclinical_AD" else "0"
            points = [{"participantId": r["Participant"], "value": float(profile[r["Participant"]])} for r in meta if r["amyloid.positive.AF"] == flag]
            values = [float(p["value"]) for p in points]
            compare({"group": frozen_group["group"], "count": len(points), "detected": sum(v > 0 for v in values), "median": statistics.median(values), "points": points}, frozen_group, "WGS_descriptive")
        wgs_status = "selected_stage_distribution_recomputed_from_extracted_author_tables"
    return {"status": "passed", "evaluationId": manifest["evaluationId"], "scope": "reference_statistics_primary_genus_and_available_wgs_descriptive_distribution", "cohorts": reports, "wgs": wgs_status, "primary": primary_status,
            "tolerance": {"absolute": ATOL, "relative": RTOL}, "runtime": {n: version(n) for n in ("numpy", "scipy", "statsmodels")},
            "limitations": ["Not scientific approval or independence certification", "FASTQ processing, binary RData extraction and source manuscripts are not recomputed", "Object explanations are archived; only declared statistical inputs are recomputed"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    print(json.dumps(verify(parser.parse_args().directory), ensure_ascii=False, indent=2))
