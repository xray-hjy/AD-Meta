"""Content-addressed local evaluation artifacts, with separate current-use checks."""
from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import re
import tempfile
from copy import deepcopy
from importlib.metadata import version
from pathlib import Path
from threading import RLock

from app.core.config import BACKEND_ROOT, SETTINGS
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference

SNAPSHOT_ROOT = SETTINGS.storage_root / "gmrepo-evaluations"
_LOCK = RLock()
CANONICALIZATION = "gmrepo-tagged-json-number-v1"
CODE_FILES = tuple(f"app/services/{name}" for name in ("gmrepo_analysis_service.py", "gmrepo_evaluation_service.py", "gmrepo_claims.py",
                   "gmrepo_ledger_models.py", "gmrepo_ledger_service.py", "gmrepo_primary_evidence.py", "gmrepo_service.py", "gmrepo_snapshot_service.py",
                   "gmrepo_replay_runner.py", "gmrepo_replay_service.py", "gmrepo_relationship_service.py", "external_wgs_service.py", "gmrepo_primary_genus.py", "gmrepo_candidate_service.py")) + (
                       "app/api/gmrepo.py", "app/api/gmrepo_models.py", "app/compute/statistics.py", "app/compute/charts/boxplot.py")


def _legacy_digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()).hexdigest()


def _canonical(value: object) -> list:
    """Explicit JSON type tags; numerically equal int/float and negative zero agree.

    Browser JSON reserialization preserves IEEE-754 values, not Python's `1.0`
    token. This is a versioned application format, not a claim of RFC 8785.
    """
    if value is None:
        return ["null"]
    if isinstance(value, bool):
        return ["boolean", value]
    if isinstance(value, str):
        return ["string", value]
    if isinstance(value, (int, float)):
        if isinstance(value, int) and abs(value) > 2**53 - 1:
            raise ValueError("快照整数超出浏览器可无损表示范围；请用字符串传递标识。")
        if not math.isfinite(value):
            raise ValueError("快照不接受非有限数值。")
        return ["number", "0" if value == 0 else format(float(value), ".17g")]
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            raise ValueError("快照对象键必须是字符串。")
        return ["object", [[k, _canonical(value[k])] for k in sorted(value)]]
    if isinstance(value, (list, tuple)):
        return ["array", [_canonical(item) for item in value]]
    raise ValueError("快照包含非 JSON 类型。")


def digest(value: object) -> str:
    return _legacy_digest(_canonical(value))


def code_fingerprint() -> str:
    return digest({name: hashlib.sha256((BACKEND_ROOT / name).read_bytes()).hexdigest() for name in CODE_FILES})


def evaluation_id(payload: dict, canonicalization: str = CANONICALIZATION) -> str:
    scientific = deepcopy(payload)
    scientific["evaluation"].pop("generatedAt", None)
    return _legacy_digest(scientific) if canonicalization == "python-json-v0" else digest(scientific)


def validate_package(package: dict) -> None:
    canonicalization = package.get("canonicalization", "python-json-v0")
    if canonicalization not in {CANONICALIZATION, "python-json-v0"}:
        raise ValueError("不支持该评估包的校验算法版本。")
    checksum = _legacy_digest if canonicalization == "python-json-v0" else digest
    if package.get("schemaVersion") != 1 or checksum(package["payload"]) != package.get("payloadSha256"):
        raise ValueError("评估快照校验失败；不返回其他版本。")
    if evaluation_id(package["payload"], canonicalization) != package.get("evaluationId"):
        raise ValueError("评估 ID 与内容不符。")


def freeze(record: dict, subject: dict | None = None, context: dict | None = None) -> dict:
    payload = {"evaluation": deepcopy(record), "subject": deepcopy(subject), "sourceContext": deepcopy(context or {}),
               "runtime": {"python": platform.python_version(), **{name: version(name) for name in ("numpy", "scipy", "statsmodels")}},
               "codeFingerprint": code_fingerprint(),
               "replay": {"readback": "self_contained_record", "recompute": "requires_declared_reference_main_and_source_dependencies",
                          "note": "包内结果可读回；未包含原矩阵和全部来源原件，不宣称离线独立重算。"}}
    key = evaluation_id(payload)
    path = SNAPSHOT_ROOT / f"{key}.json"
    with _LOCK:
        if path.is_file():
            return load(key)
        package = {"schemaVersion": 1, "canonicalization": CANONICALIZATION, "evaluationId": key, "payloadSha256": digest(payload), "payload": payload}
        SNAPSHOT_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=SNAPSHOT_ROOT, prefix=".evaluation-", suffix=".tmp", mode="w", encoding="utf-8", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(package, stream, ensure_ascii=False, sort_keys=True, allow_nan=False)
        try:
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return package


def load(key: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{64}", key):
        raise ValueError("评估 ID 无效。")
    try:
        package = json.loads((SNAPSHOT_ROOT / f"{key}.json").read_bytes())
        validate_package(package)
        if package["evaluationId"] != key:
            raise ValueError("评估 ID 与文件不符。")
        return package
    except FileNotFoundError as exc:
        raise ValueError("固定评估不存在；不会重新生成当前结果替代。") from exc


def current_status(package: dict, data: reference.ReferenceDataset) -> dict:
    record = package["payload"]["evaluation"]
    issues = []
    blocked = False
    if record["provenance"]["fingerprint"] != data.fingerprint:
        return {"status": "historical", "currentUse": "blocked", "reasons": ["参考版本已变化。"]}
    _, registry_state, registry_digest = ledger.registry(data)
    if registry_state != "bound" or registry_digest != record["researchLedger"]["registryFingerprint"]:
        issues.append("研究登记或有效复核记录已变化；历史内容保留，需重新评估当前用途。")
    if ledger.discovery(data).get("sourceFingerprint") != record["researchLedger"].get("discoveryFingerprint"):
        issues.append("来源发现索引已变化。")
    if ledger.runtime_protocol(data)["fingerprint"] != record["protocol"]["fingerprint"]:
        issues.append("评估协议已变化。")
    from app.services.gmrepo_relationship_service import assess

    if assess(data, sorted(r["projectId"] for r in record["cohorts"]))["fingerprint"] != record["researchLedger"].get("relationships", {}).get("fingerprint"):
        issues.append("研究/主外关系的输入或审查范围已变化。")
    current_audits = {r["projectId"]: r for r in analysis.audit_catalog(data)["items"]}
    for row in record["cohorts"]:
        if current_audits.get(row["projectId"]) != row["audit"]:
            issues.append(f"{row['projectId']} 的身份依据、样本范围或用途资格已变化。")
        latest = current_audits.get(row["projectId"], {})
        if any(row["audit"][f"{kind}Status"] == "eligible" and latest.get(f"{kind}Status") != "eligible" for kind in ("unadjusted", "adjusted")):
            blocked = True
    registry_record, _, _ = ledger.registry(data)
    if registry_record:
        checks = ledger.source_checks(data, registry_record)
        expected = {s["sourceId"]: s["availability"] for s in record["researchLedger"].get("sourceChecks", [])}
        changed = [s for s in checks if s["availability"] != expected.get(s["sourceId"])]
        if changed:
            issues.append("研究字段或审查原件的可用性/完整性较本次冻结时发生变化。")
            blocked = any(expected.get(s["sourceId"]) == "verified" and s["availability"] != "verified" for s in changed) or blocked
    subject = package["payload"].get("subject")
    if subject and subject["subjectType"] in {"species", "mag"}:
        from app.services.gmrepo_evaluation_service import resolve_subject

        latest = resolve_subject(data, subject["subjectType"], subject["subjectId"], subject["sourceRevision"], subject["datasetSlug"], subject["runKey"], subject["artifactKey"])
        if any(latest.get(k) != subject.get(k) for k in ("status", "genus", "sourceSha256", "representativeMag")):
            issues.append("主对象的固定版本或分类对应当前不可验证。")
            blocked = True
    if code_fingerprint() != package["payload"]["codeFingerprint"]:
        issues.append("相关评估代码已变化。")
    expected_primary = record.get("primary", {}).get("cohortEvidence", {})
    if expected_primary.get("status") == "source_bound":
        from app.services.gmrepo_primary_evidence import cohort_context

        latest_primary = cohort_context()
        if latest_primary.get("fingerprint") != expected_primary.get("fingerprint"):
            issues.append("主队列来源说明或其原件已变化；原人数与纳入说明仅保留为历史记录。")
            blocked = latest_primary.get("status") != "source_bound" or blocked
    derived = record.get("primary", {}).get("genusComparison", {})
    derived_key = derived.get("fingerprint") or record.get("primaryDerivative", {}).get("fingerprint")
    derived_provenance = derived.get("provenance") or record.get("primaryDerivative", {}).get("provenance")
    if derived_key and derived_provenance:
        from app.services.gmrepo_primary_genus import snapshot

        try:
            latest_derivative = snapshot(derived_provenance["sourceRevision"], derived_provenance["datasetSlug"])
            if latest_derivative["fingerprint"] != derived_key:
                issues.append("主队列属级派生依据或方法已变化。")
        except (OSError, ValueError, KeyError, TypeError):
            issues.append("主队列属级派生版本当前不可核验。")
            blocked = True
    if record.get("wgsReference", {}).get("catalog"):
        from app.services.external_wgs_service import object_background

        latest_wgs = object_background(record["genus"]["name"])
        if latest_wgs.get("catalog", {}).get("fingerprint") != record["wgsReference"]["catalog"]["fingerprint"]:
            issues.append("扩展 WGS 来源版本或可校验性已变化；历史图仅作为冻结记录。")
            blocked = True
    return {"status": "historical" if issues else "current", "currentUse": "blocked" if blocked else "requires_reevaluation" if issues else "reference_only",
            "reasons": issues, "note": "当前技术有效不代表科研复核或独立复现通过。"}
