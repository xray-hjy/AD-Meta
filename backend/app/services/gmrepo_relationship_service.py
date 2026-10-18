"""Bilateral overlap checks; non-matching run identifiers never certify independence."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from itertools import combinations

from app.core.config import BACKEND_ROOT
from app.services import gmrepo_ledger_service as ledger
from app.services import gmrepo_service as reference

PRIMARY = BACKEND_ROOT / "storage/provenance/CRA014435/2026-10-01/samples_current185.tsv"


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def assess(data: reference.ReferenceDataset, project_ids: list[str]) -> dict:
    registry, _, _ = ledger.registry(data)
    checks = ledger.source_checks(data, registry) if registry else []
    verified = {s["sourceId"] for s in checks if s["availability"] == "verified"}
    links = {p.projectId: p for p in registry.projects} if registry else {}
    nodes = {}
    for project in project_ids:
        rows = [s for s in data.samples if s["project_id"] == project]
        nodes[project] = {"nodeId": project, "fingerprint": ledger.comparison_digest(data, project), "kind": "reference",
                          "runs": {s["run_id"] for s in rows}, "specimens": {s["biosample_accession"] for s in rows if s.get("biosample_accession")},
                          "participantKnown": sum(bool(s.get("participant_id")) for s in rows), "records": len(rows)}
    try:
        raw = PRIMARY.read_bytes()
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t"))
        cohort = json.loads((BACKEND_ROOT / "metadata/verified_cohorts.json").read_bytes())["cohorts"][0]
        sample_hash = hashlib.sha256("\n".join(sorted(r["run_accession"] for r in rows)).encode()).hexdigest()
        if len(rows) != cohort["sampleCount"] or sample_hash != cohort["sampleSetSha256"]:
            raise ValueError("Primary sample scope differs from registered cohort")
        nodes["primary:CRA014435"] = {"nodeId": "primary:CRA014435", "fingerprint": digest({"sha256": hashlib.sha256(raw).hexdigest(), "cohort": cohort}),
                                     "kind": "primary", "runs": {r["run_accession"] for r in rows}, "specimens": {r["biosample_accession"] for r in rows if r["biosample_accession"]},
                                     "participantKnown": sum(bool(r["host_subject_id_raw"]) for r in rows), "records": len(rows)}
        primary_status = "registered_scope_matched"
    except (OSError, KeyError, ValueError):
        primary_status = "unavailable_or_scope_mismatch"
    from app.services.external_wgs_service import relationship_scope

    try:
        wgs_node = relationship_scope()
        nodes[wgs_node["nodeId"]] = wgs_node
        wgs_status = "author_matrix_and_project_run_scopes_separate"
    except (OSError, KeyError, ValueError, StopIteration):
        wgs_status = "unavailable_or_unverifiable"
    reviews = registry.relationshipReviews if registry else []
    replaced = {r.supersedes for r in reviews if r.supersedes}
    result = []
    for left, right in combinations(sorted(nodes), 2):
        a, b = nodes[left], nodes[right]
        relation_id = "relation:" + digest([left, right])[:20]
        history = []
        for r in reviews:
            if r.relationshipId != relation_id:
                continue
            valid = r.leftNode == left and r.rightNode == right and r.leftFingerprint == a["fingerprint"] and r.rightFingerprint == b["fingerprint"] and set(r.evidenceRefs) <= verified
            status = "superseded" if r.reviewId in replaced else "pending" if r.decision == "pending" else "valid" if valid else "scope_or_evidence_mismatch"
            history.append(r.model_dump(mode="json") | {"validationStatus": status})
        active = [r for r in history if r["validationStatus"] == "valid"]
        result.append({"relationshipId": relation_id, "leftNode": left, "rightNode": right, "leftFingerprint": a["fingerprint"], "rightFingerprint": b["fingerprint"],
                       "runIntersection": sorted(a["runs"] & b["runs"]), "biosampleIntersection": sorted(a["specimens"] & b["specimens"]),
                       "participantCoverage": {left: {"known": a["participantKnown"], "records": a["records"]}, right: {"known": b["participantKnown"], "records": b["records"]}},
                       "outcome": "overlap_signal_requires_review" if a["runs"] & b["runs"] or a["specimens"] & b["specimens"] else "inconclusive",
                       "reviewStatus": "reviewed_limited_scope" if active else "pending", "reviews": history,
                       "effectiveOpinions": active, "note": "已比对公开项目 Run/BioSample 编号；WGS 项目 Run 到作者矩阵 Participant 尚无逐人连接。未匹配不能证明参与者或研究独立，别名和参与者 ID 不跨研究直接相等连接。"})
    public_nodes = [{k: v for k, v in n.items() if k not in {"runs", "specimens"}} for n in nodes.values()]
    return {"status": "technical_identifier_check_complete_pending_research_review", "primaryStatus": primary_status, "wgsStatus": wgs_status,
            "fingerprint": digest({"nodes": public_nodes, "pairs": result}), "nodes": public_nodes, "pairs": result,
            "studyLinkScreening": [{"projectId": p.projectId, "studyId": p.studyId, "status": "sourced_link_pending_overlap_review" if p.studyId and set(p.evidenceRefs) <= verified else "unresolved_study_link"} for p in links.values()],
            "independentReplicationCount": None, "note": "关系复核不授予数值可比性或独立验证资格；主矩阵/模型的上游使用关系仍需另核。"}
