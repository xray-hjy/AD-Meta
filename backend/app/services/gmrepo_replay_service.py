"""Build a local standalone reference replay bundle for an unchanged frozen evaluation."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from importlib.metadata import version

from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_replay_runner as runner
from app.services import gmrepo_service as reference
from app.services import gmrepo_snapshot_service as snapshots


def bundle(data: reference.ReferenceDataset, package: dict) -> bytes:
    if snapshots.current_status(package, data)["status"] != "current":
        raise ValueError("历史评估依赖已变化，不能用当前输入冒充该次复算包；请生成新评估。")
    record = package["payload"]["evaluation"]
    cohorts, expected = [], {}
    for frozen in record["cohorts"]:
        project = frozen["projectId"]
        result = analysis.cohort_statistics(data, project)
        if result["audit"] != frozen["audit"]:
            raise ValueError("比较资格已变化，停止生成。")
        selections = record["items"] if record.get("kind") == "candidate_comparison" else [{"referenceGenus": record["genus"], "cohorts": [frozen]}]
        for candidate in selections:
            genus = candidate.get("referenceGenus")
            selected = next((r for r in result["items"] if genus and r["genus"]["featureId"] == genus["featureId"]), None)
            archived = next(r for r in candidate["cohorts"] if r["projectId"] == project)
            if selected != archived["statistic"]:
                raise ValueError("固定结果与当前完整检验族不一致，停止生成。")
        samples = sorted(reference.select_samples(data, project, scope="plot_ready"), key=lambda s: s["run_id"])
        entry, _ = analysis._review(data, project, reference.select_samples(data, project))
        cohorts.append({"projectId": project, "audit": result["audit"], "samples": [
            {"runId": s["run_id"], "participantId": s.get("participant_id"), "group": s["research_group"], "age": s["age_years"],
             "sex": analysis._sex_value(s, entry), "abundance": data.abundance[(project, s["run_id"])]} for s in samples]})
        expected[project] = result["items"]
    def encode(value):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()
    from pathlib import Path

    files = {"inputs.json": encode({"features": sorted(data.genera.values(), key=lambda g: (g["name"].casefold(), g["featureId"])), "cohorts": cohorts}),
             "expected.json": encode(expected), "evaluation.json": encode(package), "replay.py": Path(runner.__file__).read_bytes(),
             "requirements.txt": ("\n".join(f"{n}=={version(n)}" for n in ("numpy", "scipy", "statsmodels")) + "\n").encode(),
             "README.txt": "本地科研参考复算包。解压后在具备 requirements.txt 依赖的 Python 环境运行 python replay.py <解压目录>。\n复算完整参考检验族，不重算主物种/MAG 矩阵、分类映射或论文；不等于科研复核、独立验证或允许公开/商业再分发。原件及使用条件见 evaluation.json。\n".encode()}
    bound = record.get("primaryDerivative") or record.get("primary", {}).get("genusComparison", {})
    if bound.get("fingerprint"):
        from app.services import gmrepo_primary_genus as primary

        derived = primary.snapshot(bound["provenance"]["sourceRevision"], bound["provenance"]["datasetSlug"])
        if derived["fingerprint"] != bound["fingerprint"]:
            raise ValueError("Primary derivation changed; no substitution.")
        files["primary-inputs.json"] = encode(derived["inputs"])
        files["primary-expected.json"] = encode(derived["statistics"])
        files["README.txt"] += "\n包含主队列已发布种级观察、分类与协变量：独立重算属级求和、完整检验族与固定候选结果；不重跑 FASTQ 上游流程。主队列采用原研究独立观测假设，非逐人身份认证。\n".encode()
    if record.get("wgsReference", {}).get("distribution"):
        from app.services.external_wgs_service import ROOT

        files["wgs-participants.tsv"] = (ROOT / "extracted/participants.tsv").read_bytes()
        files["wgs-profiles.tsv"] = (ROOT / "extracted/taxonomic_profiles.tsv").read_bytes()
    manifest = {"schemaVersion": 1, "evaluationId": package["evaluationId"], "referenceFingerprint": data.fingerprint,
                "methodVersion": analysis.METHOD_VERSION, "familySize": len(data.genera), "codeFingerprint": package["payload"]["codeFingerprint"],
                "files": {k: {"sha256": hashlib.sha256(v).hexdigest(), "bytes": len(v)} for k, v in files.items()}}
    files["manifest.json"] = encode(manifest)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in files.items():
            archive.writestr(name, raw)
    return output.getvalue()
