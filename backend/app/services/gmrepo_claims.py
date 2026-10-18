"""Deterministic, field-bound explanations; no evidence scoring or cross-study votes."""
RULE_VERSION = "gmrepo-object-explanation-2026-10-15-v2"


def cohort_claims(rows: list[dict], reference_fingerprint: str, family_size: int) -> list[dict]:
    claims = []
    for index, row in enumerate(rows):
        project, audit, stat = row["projectId"], row["audit"], row["statistic"]
        base = {"projectId": project, "referenceFingerprint": reference_fingerprint,
                "comparisonFingerprint": row["researchRecord"]["comparison"]["contentFingerprint"],
                "rulesVersion": RULE_VERSION, "familySize": family_size,
                "evidenceRefs": [f"#/cohorts/{index}/audit", f"#/cohorts/{index}/statistic"]}
        if stat is None:
            claims.append(base | {"claimId": f"{project}:descriptive", "kind": "descriptive_only", "values": {"plotRuns": audit["plotReadyRuns"]},
                                  "text": f"{project} 可查看 {audit['plotReadyRuns']} Run 的属级分布，但当前检验暂缓，不能据图表方向宣称统计关联。"})
            continue
        direction = {"AD": "AD 偏高", "NC": "NC 偏高", "equal": "秩效应为零，不等同全零或没有关联"}[stat["direction"]]
        support = "通过当前 FDR 门槛" if stat["qValue"] < .05 else "未获当前 FDR 支持，不代表没有关联"
        claims.append(base | {"claimId": f"{project}:unadjusted", "kind": "unadjusted", "values": {
            "effect": stat["rankBiserial"], "qValue": stat["qValue"], "adCount": stat["adCount"], "ncCount": stat["ncCount"]},
            "text": f"{project} 未调整：{direction}；{support}。效应单位为秩二列相关。"})
        adjusted = stat.get("adjusted")
        if adjusted is None or adjusted["status"] not in {"estimated", "constant"}:
            text = f"{project} 调整检验{'未能估计' if adjusted else '暂缓'}；不将缺失的效应或 q 值记为零。"
            kind = "adjusted_unavailable"
        elif adjusted["status"] == "constant":
            text = f"{project} 调整模型响应为常量，无法提供通常的差异区间；不将其解释为证明没有关联。"
            kind = "adjusted_constant"
        else:
            conflict = stat["rankBiserial"] * adjusted["effect"] < 0
            text = f"{project} 调整使用 {audit['adjustedCount']} 个完整协变量 Run，效应为百分位秩点差；{'调整前后方向不一致，不能概括为稳定同向支持。' if conflict else '须结合调整后 q 值与区间解释；两种效应单位不能直接相减。'}"
            kind = "direction_conflict" if conflict else "adjusted_estimated"
        claims.append(base | {"claimId": f"{project}:adjusted", "kind": kind,
                              "values": {"adjusted": adjusted, "completeCaseRuns": audit["adjustedCount"], "adjustedRunSetSha256": audit["adjustedRunSetSha256"]}, "text": text})
    return claims
