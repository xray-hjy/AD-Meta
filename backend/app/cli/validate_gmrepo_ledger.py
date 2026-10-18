"""Validate the research ledger against installed inputs, not scientific approval."""
import json

from app.services import gmrepo_evaluation_service as evaluation
from app.services import gmrepo_service as reference
from app.services.gmrepo_ledger_models import ResearchLedger


def main() -> int:
    result = evaluation.resources(reference.load_reference_dataset())
    ledger = ResearchLedger.model_validate(result["researchLedger"])
    audit_ids = {r["projectId"] for r in result["items"] if r["unadjustedStatus"] == "eligible"}
    ledger_ids = {r.projectId for r in ledger.records if r.capabilities["unadjusted"].status == "eligible"}
    readback = {status: sum(r["availability"] == status for r in ledger.acquisitions)
                for status in ("verified", "unavailable", "integrity_error")}
    sources = {status: sum(r["availability"] == status for r in ledger.sourceChecks)
               for status in ("verified", "unavailable", "integrity_error")}
    valid = ledger.registryStatus == "bound" and audit_ids == ledger_ids and not readback["integrity_error"] and not sources["integrity_error"]
    print(json.dumps({"technicalValidation": "passed" if valid else "failed", "referenceFingerprint": ledger.referenceFingerprint,
                      "registryFingerprint": ledger.registryFingerprint, "counts": ledger.counts,
                      "capabilityCounts": result["counts"], "discoveryStatus": ledger.discoveryStatus,
                      "acquisitionChecks": readback,
                      "studySourceChecks": sources,
                      "screeningDispositions": {status: sum(r.screening.get("status") == status for r in ledger.records)
                                                 for status in sorted({r.screening.get("status", "pending") for r in ledger.records})},
                      "acquisitionReadbackStatus": "failed" if readback["integrity_error"] else "partial" if readback["unavailable"] else "verified" if ledger.acquisitions else "unavailable",
                      "scientificReviewStatus": ledger.scientificReviewStatus,
                      "note": "技术校验不构成科研审查；来源原件不可读或校验失败须继续补证。"}, ensure_ascii=False, indent=2))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
