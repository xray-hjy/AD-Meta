"""Export auditable reference analyses to a NEW directory without changing inputs."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy
import scipy
import statsmodels

from app.services import gmrepo_analysis_service as analysis
from app.services.gmrepo_service import load_reference_dataset


def export(output: Path) -> dict:
    if output.exists():
        raise ValueError("输出目录已存在；请使用新的版本目录，避免覆盖已有结果。")
    data = load_reference_dataset()
    audit = analysis.audit_catalog(data)
    # Prepare every result before creating the directory; source integrity errors fail closed.
    results = {row["projectId"]: analysis.cohort_statistics(data, row["projectId"]) for row in audit["items"]}
    selected = {row["projectId"]: {"distribution": analysis.distribution(data, row["projectId"], "NCBI:816"),
                                  "evidence": analysis.evidence(data, row["projectId"], "NCBI:816")}
                for row in audit["items"] if row["unadjustedStatus"] == "eligible"}
    output.mkdir(parents=True)

    def write(name, payload):
        (output / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    write("cohort_audit.json", audit)
    for cohort, result in results.items():
        write(f"{cohort}_statistics.json", result)
        if result["items"]:
            with (output / f"{cohort}_statistics.tsv").open("w", encoding="utf-8-sig", newline="") as stream:
                fields = ["feature_id", "genus", "ad_n", "nc_n", "ad_median_percent", "nc_median_percent", "rank_biserial", "p", "q",
                          "adjusted_n", "adjusted_rank_effect", "adjusted_ci_low", "adjusted_ci_high", "adjusted_p", "adjusted_q", "signal_status"]
                writer = csv.DictWriter(stream, fieldnames=fields, delimiter="\t")
                writer.writeheader()
                for row in result["items"]:
                    adjusted = row["adjusted"] or {}
                    writer.writerow(dict(zip(fields, [row["genus"]["featureId"], row["genus"]["name"], row["adCount"], row["ncCount"],
                                                      row["adMedianPercent"], row["ncMedianPercent"], row["rankBiserial"], row["pValue"], row["qValue"],
                                                      result["audit"]["adjustedCount"], adjusted.get("effect"), adjusted.get("ciLow"), adjusted.get("ciHigh"),
                                                      adjusted.get("pValue"), adjusted.get("qValue"), row["signalStatus"]], strict=True)))
    for cohort, record in selected.items():
        write(f"{cohort}_Bacteroides_evidence.json", record)
    report = ["# GMrepo 队列内探索性分析", "", f"方法版本：{analysis.METHOD_VERSION}", f"输入 fingerprint：{data.fingerprint}", "",
              f"分布保留原相对百分比、零值及分类待解析信息。各队列各模型的检验族均为全部 {len(data.genera)} 个确认目标属。", "",
              "| 队列 | 图表 AD/NC | 未调整检验 | 调整完整样本 | 未调整 q<0.05 | 调整 q<0.05 | 同向且均通过 |",
              "|---|---:|---|---:|---:|---:|---:|"]
    for row in audit["items"]:
        summary = results[row["projectId"]]["summary"]
        report.append(f"| {row['projectId']} | {row['groupCounts'].get('AD', 0)}/{row['groupCounts'].get('NC', 0)} | {row['unadjustedStatus']} | {row['adjustedCount']} | {summary['unadjustedFdrCount'] if row['unadjustedStatus'] == 'eligible' else '未执行'} | {summary['adjustedFdrCount'] if row['adjustedStatus'] == 'eligible' else '未执行'} | {summary['concordantFdrCount'] if row['adjustedStatus'] == 'eligible' else '未执行'} |")
    report.extend(["", "blocked 队列只提供描述性分布，不输出 p/q。具体理由见 cohort_audit.json。",
                   "", analysis.METHODS["unadjusted"], "", analysis.METHODS["adjusted"], "", analysis.METHODS["fdr"], "",
                   "此命令导出外部参考统计；主属级派生及主外同版本完整结果请使用评估页的离线复算包。主外并列参考不认证跨平台或参与者独立复现。", ""])
    report.extend(f"- {limit}" for limit in analysis.METHODS["limits"])
    report.extend(["", "来源：", ""])
    report.extend(f"- [{row['projectId']} 原研究]({row['sourceUrl']})；身份与分组文件见 cohort_audit.json。" for row in audit["items"] if row["sourceUrl"])
    report.extend(f"- [{source['label']}]({source['url']})" for source in analysis.METHODS["sources"])
    (output / "README.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    files = [{"path": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(output.iterdir())]
    manifest = {"analysisVersion": "2026-10-12-v1", "createdAt": datetime.now(UTC).isoformat(), "inputFingerprint": data.fingerprint,
                "methods": analysis.METHODS, "software": {"numpy": numpy.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__},
                "files": files}
    write("analysis_manifest.json", manifest)
    # Read back all outputs and verify counts, field availability and hashes.
    for entry in files:
        raw = (output / entry["path"]).read_bytes()
        if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError("输出读回校验失败。")
    return {"output": str(output.resolve()), "files": len(files) + 1, "cohorts": len(results), "inferenceCohorts": len(selected)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(export(args.output), ensure_ascii=False))


if __name__ == "__main__":
    main()
