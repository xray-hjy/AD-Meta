"""Validate explicit human review submissions; dry-run by default, never auto-sign."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from app.cli.inventory_gmrepo import write_json
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_review_service as review
from app.services import gmrepo_service as reference
from app.services.gmrepo_ledger_models import ResearchRegistry


def validate(submission: dict, data: reference.ReferenceDataset) -> tuple[dict, dict]:
    current_raw = ledger.REGISTRY_PATH.read_bytes()
    if submission.get("baseRegistrySha256") != hashlib.sha256(current_raw).hexdigest() or submission.get("referenceFingerprint") != data.fingerprint:
        raise ValueError("登记或参考版本已变化，请重新生成待审范围。")
    dossier = review.workspace(data)
    if submission.get("dossierFingerprint") != dossier["fingerprint"]:
        raise ValueError("待审原件、关系或数据语义已变化，需重新核查，不能沿用旧包。")
    incoming = submission.get("reviews", [])
    relations = submission.get("relationshipReviews", [])
    if not incoming and not relations:
        raise ValueError("没有实际意见；空模板不会发布。")
    payload = json.loads(current_raw)
    payload["reviews"].extend(incoming)
    payload.setdefault("relationshipReviews", []).extend(relations)
    candidate = ResearchRegistry.model_validate(payload)
    verified = {s["sourceId"] for s in ledger.source_checks(data, candidate) if s["availability"] == "verified"}
    method = ledger.runtime_protocol(data)["methodVersion"]
    for item in incoming:
        samples = [s for s in data.samples if s["project_id"] == item["projectId"]]
        if item["decision"] == "pending" or item["allRunSetSha256"] != ledger.run_set_digest(samples) or item.get("comparisonFingerprint") != ledger.comparison_digest(data, item["projectId"]) or item.get("methodVersion") != method or not set(item["evidenceRefs"]) <= verified:
            raise ValueError("意见未签署、范围/方法不匹配或原件不可验证。")
    current_relations = {r["relationshipId"]: r for r in dossier["researchLedger"]["relationships"]["pairs"]}
    for item in relations:
        actual = current_relations.get(item["relationshipId"])
        if item["decision"] == "pending" or not actual or any(item[k] != actual[k] for k in ("leftNode", "rightNode", "leftFingerprint", "rightFingerprint")) or not set(item["evidenceRefs"]) <= verified:
            raise ValueError("双边关系或原件不匹配，不能跨范围发布。")
    return candidate.model_dump(mode="json"), {"status": "technical_validation_only", "newReviews": len(incoming), "newRelationshipReviews": len(relations),
                                             "note": "软件不认证人员身份，也不替代科研判断；有效决定仍受各模型/数据门槛限制。"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("submission", type=Path)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--confirm-human-authorship", action="store_true")
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    payload, result = validate(json.loads(args.submission.read_bytes()), reference.load_reference_dataset())
    if args.publish:
        if not args.confirm_human_authorship or not args.archive or args.archive.exists():
            raise ValueError("显式发布需确认实际人工作者并指定新的归档目录。")
        args.archive.mkdir(parents=True)
        (args.archive / "previous-registry.json").write_bytes(ledger.REGISTRY_PATH.read_bytes())
        (args.archive / "submitted-review.json").write_bytes(args.submission.read_bytes())
        with tempfile.NamedTemporaryFile(dir=ledger.REGISTRY_PATH.parent, mode="w", encoding="utf-8", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        try:
            os.replace(temporary, ledger.REGISTRY_PATH)
        finally:
            temporary.unlink(missing_ok=True)
        write_json(args.archive / "publication.json", result)
    print(json.dumps({**result, "published": args.publish}, ensure_ascii=False, indent=2))
