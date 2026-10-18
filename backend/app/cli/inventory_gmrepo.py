"""Capture official phenotype inventories and reconcile them with a sealed local package.

This is discovery, not an inference/abundance import. Source disease labels are
retained; participants, stages and same-study controls still require review.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import BACKEND_ROOT
from app.services import gmrepo_service as reference

BASE = "https://gmrepo.humangut.info"


def capture(url: str, output: Path, body: dict | None = None) -> tuple[bytes, dict]:
    payload = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=payload, headers={
        "User-Agent": "AD-Meta/1.0 research-resource-inventory", "Accept": "application/xml,text/xml" if output.suffix == ".xml" else "application/json,text/tab-separated-values",
        "Content-Type": "application/json",
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                raw = response.read()
                content_type = response.headers.get("Content-Type", "")
            output.write_bytes(raw)
            return raw, {"url": url, "method": "POST" if body is not None else "GET", "body": body,
                         "status": "retrieved", "retrievedAt": datetime.now(UTC).isoformat(),
                         "file": output.name, "sha256": hashlib.sha256(raw).hexdigest(),
                         "bytes": len(raw), "contentType": content_type}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == 2:
                write_json(output.with_suffix(output.suffix + ".error.json"), {"url": url, "body": body,
                           "status": "failed", "retrievedAt": datetime.now(UTC).isoformat(), "error": str(exc)})
                raise
            time.sleep(1 + attempt)
    raise RuntimeError("Capture failed")


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def project_tsv(raw: bytes) -> list[dict]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t")
    if not reader.fieldnames or "project_id" not in reader.fieldnames:
        raise ValueError("Official project export is not the expected TSV schema (HTML is not an empty directory).")
    rows = list(reader)
    if not rows or any(not re.fullmatch(r"PRJ[A-Z0-9]+", r.get("project_id") or "") for r in rows):
        raise ValueError("Official project TSV contains no valid project scope.")
    if len({r["project_id"] for r in rows}) != len(rows):
        raise ValueError("Official project TSV contains duplicate project IDs.")
    return rows


def publish_candidate(result: dict, output: Path, target: Path) -> None:
    """Never replace a usable index with an incomplete/invalid acquisition batch."""
    if result.get("errors") or not result.get("projects") or not result.get("scopes") or not result.get("referenceFingerprint"):
        raise ValueError("Candidate inventory is incomplete; published index preserved.")
    if not all(s.get("paginationComplete") and s.get("expectedRuns") == s.get("retrievedRuns") for s in result["scopes"]):
        raise ValueError("Pagination incomplete; published index preserved.")
    for receipt in result.get("queries", []):
        path = (output / receipt["file"]).resolve()
        if not path.is_relative_to(output.resolve()):
            raise ValueError("Receipt path escapes batch.")
        raw = path.read_bytes()
        if receipt.get("status") != "retrieved" or len(raw) != receipt["bytes"] or hashlib.sha256(raw).hexdigest() != receipt["sha256"]:
            raise ValueError("Acquisition integrity check failed; published index preserved.")
        if path.suffix == ".tsv":
            project_tsv(raw)
        elif path.suffix == ".json":
            value = json.loads(raw)
            if not isinstance(value, (list, dict)):
                raise ValueError("Acquisition is not a structured API response.")
    if not result.get("queries"):
        raise ValueError("Missing acquisition receipts; published index preserved.")
    if target.exists():
        if (output / "previous-published-registry.json").exists():
            raise ValueError("Batch was already published; previous index archive will not be overwritten.")
        previous = json.loads(target.read_bytes())
        write_json(output / "previous-published-registry.json", previous)
    public = {**result, "archivePath": output.resolve().relative_to(BACKEND_ROOT.parent.resolve()).as_posix()}
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".gmrepo-index-", suffix=".tmp", mode="w", encoding="utf-8", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(public, stream, ensure_ascii=False, indent=2)
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    write_json(output / "publish-receipt.json", {"publishedAt": datetime.now(UTC).isoformat(), "indexSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "referenceFingerprint": result["referenceFingerprint"]})


def inventory(output: Path, publish: bool = False) -> dict:
    if output.exists():
        raise ValueError("输出目录已存在；请选择新目录，原发现快照不覆盖。")
    output.mkdir(parents=True)
    local = reference.load_reference_dataset()
    installed = {s["project_id"] for s in local.samples}
    queries, errors, projects, scopes = [], [], {}, []
    project_runs: dict[str, dict[str, dict]] = {}

    def get_json(endpoint: str, body: dict, name: str):
        raw, receipt = capture(BASE + "/api/" + endpoint + "/", output / name, body)
        queries.append(receipt)
        return json.loads(raw)

    terms = get_json("get_all_phenotypes", {}, "phenotypes.json")
    matched = [row for row in terms["phenotypes"] if row["disease"] == "D000544" or
               any(word in row["term"].casefold() for word in ("alzheimer", "cognitive", "dementia"))]
    for term in matched:
        mesh = term["disease"]
        detail = get_json("getAssociatedMicrobiotaDatasetsByPhenotypeMeshID", {"mesh_id": mesh}, f"{mesh}-metadata.json")
        runs = []
        seen = set()
        for skip in range(0, int(term["all_samples"]) + 250, 250):
            page = get_json("getAssociatedRunsByPhenotypeMeshIDLimit", {"mesh_id": mesh, "limit": 250, "skip": skip}, f"{mesh}-runs-{skip}.json")
            if not isinstance(page, list):
                errors.append(f"{mesh}：分页响应结构不是列表。")
                break
            ids = {row["run_id"] for row in page}
            if len(ids) != len(page) or ids & seen:
                errors.append(f"{mesh}：分页 Run 重复；检索完整性未通过。")
                break
            runs.extend(page)
            seen.update(ids)
            if len(page) < 250:
                break
            time.sleep(.3)
        complete = len(runs) == int(term["all_samples"])
        if not complete:
            errors.append(f"{mesh}：分页取得 {len(runs)} Run，源端登记 {term['all_samples']}，需核查。")
        source_projects = {r["project_id"]: r for r in detail.get("assoc_projects", [])}
        for pid in sorted({r["project_id"] for r in runs} | set(source_projects)):
            samples = [r for r in runs if r["project_id"] == pid]
            item = projects.setdefault(pid, {"projectId": pid, "phenotypes": [], "platformTypes": {}, "installed": pid in installed,
                                           "reviewStatus": "pending_original_study_review", "controlsStatus": "pending_same_study_control_review"})
            item["phenotypes"].append(mesh)
            item["phenotype"] = " / ".join(item["phenotypes"])
            project_runs.setdefault(pid, {}).update({r["run_id"]: r for r in samples})
            item["platformTypes"] = dict(Counter(str(r.get("experiment_type") or "unknown") for r in project_runs[pid].values()))
            item["platform"] = " / ".join(sorted(item["platformTypes"])) or "待核查"
            item["originalDescription"] = source_projects.get(pid, {}).get("Original_Project_description", "")
            item["publications"] = source_projects.get(pid, {}).get("Related_Publications")
        scopes.append({"phenotype": mesh, "term": term["term"], "expectedRuns": int(term["all_samples"]),
                       "retrievedRuns": len(runs), "paginationComplete": complete,
                       "apiProjects": len(source_projects), "platformTypes": dict(Counter(str(r.get("experiment_type") or "unknown") for r in runs))})
    tsv_url = BASE + "/Downloads/ProjectsByPhenotypeID/all_projects_contain_samples_of_D000544.tsv"
    raw, receipt = capture(tsv_url, output / "D000544-projects.tsv")
    queries.append({**receipt, "label": "官方 AD 表型项目 TSV"})
    tsv_rows = project_tsv(raw)
    tsv_ids = {r["project_id"] for r in tsv_rows}
    api_ad_ids = {pid for pid, item in projects.items() if "D000544" in item["phenotypes"]}
    result = {
        "schemaVersion": 1, "status": "partial", "retrievedAt": datetime.now(UTC).isoformat(),
        "referenceFingerprint": local.fingerprint, "officialRelease": None,
        "scopes": scopes, "projects": list(projects.values()), "queries": queries,
        "installedNotDiscovered": sorted(installed - set(projects)),
        "discoveredNotInstalled": sorted(set(projects) - installed), "errors": errors,
        "exportDiscrepancy": {"adTsvProjects": len(tsv_ids), "adApiProjects": len(api_ad_ids),
                              "apiOnly": sorted(api_ad_ids - tsv_ids), "tsvOnly": sorted(tsv_ids - api_ad_ids)},
        "archivePath": str(output.resolve()),
        "note": "已查询官方 AD 与相关认知表型目录，并分页核对 Run；API 和静态 TSV 的范围差异保留。关键词未标注研究、同研究对照、疾病阶段和独立性仍需原研究审查；此目录不等于全部 AD 研究或全部可检验队列。",
        "coverage": {"status": "complete_for_listed_phenotypes" if not errors else "incomplete_for_listed_phenotypes",
                     "scope": "仅当前列明的官方表型查询，不包含全库关键词穷尽检索或原研究纳入审查。",
                     "uniqueRuns": len({rid for rows in project_runs.values() for rid in rows}),
                     "summedPhenotypeRuns": sum(s["retrievedRuns"] for s in scopes),
                     "uniqueProjects": len(projects),
                     "wholeDatabaseComplete": False},
    }
    write_json(output / "registry.json", result)
    target = BACKEND_ROOT / "metadata/gmrepo_discovery_registry.json"
    previous = json.loads(target.read_bytes()) if target.is_file() else {"projects": []}
    before = {r["projectId"]: r for r in previous.get("projects", [])}
    write_json(output / "candidate-changes.json", {"previousFingerprint": hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None,
               "addedProjects": sorted(set(projects) - set(before)), "missingProjects": sorted(set(before) - set(projects)),
               "sourceLabelChanges": [pid for pid in sorted(set(before) & set(projects)) if any(before[pid].get(k) != projects[pid].get(k) for k in ("phenotypes", "platform", "originalDescription", "publications"))],
               "note": "候选批次不自动改变研究分组、接入资格或已发布清单。"})
    if publish:
        # A new inventory is immutable; only this published discovery index moves.
        publish_candidate(result, output, target)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--publish-existing", action="store_true", help="Validate and explicitly publish a previously acquired candidate; do not refetch.")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else BACKEND_ROOT.parent / args.output
    if args.publish_existing:
        result = json.loads((output / "registry.json").read_bytes())
        if result.get("referenceFingerprint") != reference.load_reference_dataset().fingerprint:
            raise ValueError("Candidate belongs to a different reference package.")
        publish_candidate(result, output, BACKEND_ROOT / "metadata/gmrepo_discovery_registry.json")
    else:
        result = inventory(output, args.publish)
    print(json.dumps({"projects": len(result["projects"]), "scopes": result["scopes"],
                      "newProjects": result["discoveredNotInstalled"], "errors": result["errors"],
                      "exportDiscrepancy": result["exportDiscrepancy"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
