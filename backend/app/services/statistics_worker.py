from __future__ import annotations

import math
from typing import Any

import httpx
import pandas as pd

from app.core.config import STATS_WORKER_TIMEOUT, STATS_WORKER_URL


class FormalAnalysisError(RuntimeError):
    pass


WORKER_METRICS = {"attempts": 0, "failures": 0}


def worker_metrics() -> dict[str, int]:
    return dict(WORKER_METRICS)


def method_for_scale(abundance_scale: str) -> str | None:
    if abundance_scale == "counts":
        return "ancombc2"
    if abundance_scale in {"relative_abundance", "normalized_abundance"}:
        return "maaslin2"
    return None


def build_differential_request(
    *,
    job_id: str,
    df: pd.DataFrame,
    feature_cols: list[str],
    abundance_scale: str,
    covariates: list[str],
    alpha: float = 0.05,
    prevalence: float = 0.1,
) -> dict[str, Any]:
    method = method_for_scale(abundance_scale)
    if method is None:
        raise FormalAnalysisError(f"No formal model is defined for abundanceScale={abundance_scale}")
    formula_terms = ["Group", *covariates]
    metadata_columns = ["Sample", "Group", *covariates]
    return {
        "jobId": job_id,
        "method": method,
        "abundanceScale": abundance_scale,
        "formula": " + ".join(formula_terms),
        "alpha": alpha,
        "prevalence": prevalence,
        "samples": df[metadata_columns].to_dict(orient="records"),
        "features": feature_cols,
        "matrix": df[feature_cols].to_numpy(dtype=float).tolist(),
        "parameters": (
            {
                "normalization": "NONE",
                "transform": "LOG",
                "analysisMethod": "LM",
            }
            if method == "maaslin2"
            else {"pAdjustMethod": "BH", "structuralZero": True}
        ),
    }


def _canonical_method(value: Any) -> str:
    normalized = "".join(character for character in str(value).lower() if character.isalnum())
    return {"ancombc2": "ancombc2", "maaslin2": "maaslin2"}.get(normalized, normalized)


def _validated_result(
    payload: Any,
    expected_method: str,
    formula: str,
    expected_features: list[str],
    job_id: str,
    expected_alpha: float,
) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise FormalAnalysisError("Statistics worker returned an invalid response contract")
    if payload.get("jobId") != job_id:
        raise FormalAnalysisError("Statistics worker response does not match the requested job")
    if _canonical_method(payload.get("method")) != _canonical_method(expected_method):
        raise FormalAnalysisError("Statistics worker response method does not match the request")
    if payload.get("modelFormula") != formula:
        raise FormalAnalysisError("Statistics worker response formula does not match the request")
    try:
        alpha = float(payload.get("alpha"))
    except (TypeError, ValueError) as exc:
        raise FormalAnalysisError("Statistics worker response has an invalid alpha") from exc
    if not math.isfinite(alpha) or alpha != expected_alpha:
        raise FormalAnalysisError("Statistics worker response alpha does not match the request")
    allowed_features = set(expected_features)
    returned_features: set[str] = set()
    items = []
    for index, item in enumerate(payload["items"]):
        if not isinstance(item, dict) or not item.get("featureId"):
            raise FormalAnalysisError(f"Statistics worker item {index} is invalid")
        normalized = dict(item)
        feature_id = str(normalized["featureId"])
        if feature_id not in allowed_features:
            raise FormalAnalysisError(f"Statistics worker item {index} is not part of the request")
        if feature_id in returned_features:
            raise FormalAnalysisError(f"Statistics worker item {index} duplicates featureId={feature_id}")
        returned_features.add(feature_id)
        for key in ("pValue", "qValue", "effectSize"):
            try:
                value = float(normalized[key])
            except (KeyError, TypeError, ValueError) as exc:
                raise FormalAnalysisError(f"Statistics worker item {index} has invalid {key}") from exc
            if not math.isfinite(value):
                raise FormalAnalysisError(f"Statistics worker item {index} has non-finite {key}")
            normalized[key] = value
        if not 0 <= normalized["pValue"] <= 1 or not 0 <= normalized["qValue"] <= 1:
            raise FormalAnalysisError(f"Statistics worker item {index} has an invalid probability")
        items.append(normalized)
    return {
        "method": payload["method"],
        "inferenceLevel": "formal_compositional_model",
        "modelFormula": formula,
        "alpha": alpha,
        "items": items,
        "summary": payload.get("summary", {"testedCount": len(items)}),
    }


def run_formal_differential(
    *,
    job_id: str,
    df: pd.DataFrame,
    feature_cols: list[str],
    abundance_scale: str,
    covariates: list[str],
) -> dict[str, Any]:
    WORKER_METRICS["attempts"] += 1
    try:
        request = build_differential_request(
            job_id=job_id,
            df=df,
            feature_cols=feature_cols,
            abundance_scale=abundance_scale,
            covariates=covariates,
        )
        if not STATS_WORKER_URL:
            raise FormalAnalysisError(
                "A formal abundance scale was declared but AD_META_STATS_WORKER_URL is not configured"
            )
        try:
            response = httpx.post(
                f"{STATS_WORKER_URL}/v1/differential-abundance",
                json=request,
                timeout=STATS_WORKER_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise FormalAnalysisError(f"Statistics worker failed: {exc}") from exc
        return _validated_result(
            payload,
            request["method"],
            request["formula"],
            request["features"],
            request["jobId"],
            request["alpha"],
        )
    except Exception:
        WORKER_METRICS["failures"] += 1
        raise
