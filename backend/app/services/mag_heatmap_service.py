"""Auditable heatmap selection; display filters never redefine the BH test family."""
import hashlib
import json
import re

import numpy as np
from scipy.cluster.hierarchy import leaves_list, linkage

DEFAULT_SETTINGS = {
    "heatmapMode": "abundance", "heatmapQuery": "", "heatmapIds": "", "candidateKind": "statistics",
    "minMean": 0.0, "sampleThreshold": 0.0, "minSamplePercent": 0.0,
    "minCompleteness": None, "maxContamination": None, "maxQ": 0.05, "minEffect": 0.0,
    "sampleOrder": "group", "rowOrder": "rank", "colorMode": "abundance",
}


def _cluster(values, leaf_ids):
    if len(values) < 2 or values.shape[1] == 0:
        return list(range(len(values))), {"leafIds": leaf_ids, "merges": []}
    tree = linkage(values, method="average", metric="euclidean", optimal_ordering=False)
    return leaves_list(tree).tolist(), {
        "leafIds": leaf_ids,
        "merges": [[int(a), int(b), float(distance), int(size)] for a, b, distance, size in tree],
    }


def build_heatmap(data, indices, rows, top_n=20, settings=None):
    config = {**DEFAULT_SETTINGS, **(settings or {})}
    matrix = data.matrix[indices]
    transformed = np.log10(1 + matrix)
    deviations = transformed.std(axis=0) if len(indices) else np.zeros(len(data.mag_ids))
    ratios = (matrix > config["sampleThreshold"]).mean(axis=0) * 100 if len(indices) else np.zeros(len(data.mag_ids))
    positions = {mag_id: i for i, mag_id in enumerate(data.mag_ids)}
    selected = list(rows) if indices else []
    exclusions = []

    def retain(label, predicate):
        nonlocal selected
        before = len(selected)
        selected = [row for row in selected if predicate(row)]
        exclusions.append({"reason": label, "count": before - len(selected)})

    needle = config["heatmapQuery"].strip().casefold()
    exact_id = needle in {mag_id.casefold() for mag_id in data.mag_ids}
    retain("ID / 分类条件", lambda r: r["magId"].casefold() == needle if exact_id else
           not needle or any(needle in v.casefold() for v in [r["magId"], *r["taxonomy"].values()]))
    retain("质量条件", lambda r: (
        (config["minCompleteness"] is None or r["completenessPercent"] is not None and r["completenessPercent"] >= config["minCompleteness"])
        and (config["maxContamination"] is None or r["contaminationPercent"] is not None and r["contaminationPercent"] <= config["maxContamination"])))
    retain("平均丰度条件", lambda r: r["meanPercent"] is not None and r["meanPercent"] >= config["minMean"])
    retain("超过阈值的样本比例条件", lambda r: ratios[positions[r["magId"]]] >= config["minSamplePercent"])
    warnings = []
    if config["heatmapMode"] == "variance":
        retain("零变异 MAG", lambda r: deviations[positions[r["magId"]]] > 1e-12)
        selected.sort(key=lambda r: (-deviations[positions[r["magId"]]], r["magId"]))
    elif config["heatmapMode"] == "candidate":
        if config["candidateKind"] == "manual":
            ids = list(dict.fromkeys(x for x in re.split(r"[,;\s]+", config["heatmapIds"].strip()) if x))
            unknown = set(ids) - set(data.mag_ids)
            if unknown:
                raise ValueError("以下 MAG ID 不存在：" + ", ".join(sorted(unknown)[:5]))
            retain("手动 MAG 清单", lambda r: r["magId"] in ids)
            manual_order = {mag_id: i for i, mag_id in enumerate(ids)}
            selected.sort(key=lambda r: manual_order[r["magId"]])
            if not ids:
                warnings.append("请添加完整 MAG ID；手动清单为空时不会自动补入高丰度 MAG。")
        else:
            retain("q 值 / 秩效应量条件", lambda r: r["qValue"] is not None and r["qValue"] <= config["maxQ"]
                   and abs(r["rankBiserial"]) >= config["minEffect"])
            selected.sort(key=lambda r: (r["qValue"], -abs(r["rankBiserial"]), r["magId"]))
            if not any(r["qValue"] is not None for r in rows):
                warnings.append("当前范围不足以进行两组检验；AD、NC 各至少需要 2 个样本。")
    else:
        selected.sort(key=lambda r: (-(r["meanPercent"] or 0), r["magId"]))
    matched = len(selected)
    shown = selected if top_n == 0 else selected[:top_n]
    columns = [positions[r["magId"]] for r in shown]
    raw = matrix[:, columns]
    display = np.log10(1 + raw)
    constant = []
    if len(indices) and columns:
        std = display.std(axis=0)
        constant = [r["magId"] for i, r in enumerate(shown) if std[i] <= 1e-12]
        if config["colorMode"] == "rowZ":
            display = (display - display.mean(axis=0)) / np.where(std > 1e-12, std, 1)
            display[:, std <= 1e-12] = 0
    mag_tree = None
    sample_trees = []
    if config["rowOrder"] == "cluster" and columns:
        order, mag_tree = _cluster(display.T, [r["magId"] for r in shown])
        shown = [shown[i] for i in order]
        columns = [columns[i] for i in order]
        raw, display = raw[:, order], display[:, order]
    base = sorted(range(len(indices)), key=lambda i: (data.samples[indices[i]]["disease"], data.samples[indices[i]]["batch"], data.sample_ids[indices[i]]))
    if config["sampleOrder"] == "cluster":
        # Stable input order before clustering makes tied distances reproducible.
        clustered, tree = _cluster(display[base], [data.sample_ids[indices[i]] for i in base])
        sample_trees.append({**tree, "group": "all"})
        order = [base[i] for i in clustered]
    elif config["sampleOrder"] == "withinGroup":
        order = []
        for group in ("AD", "NC"):
            block = [i for i in base if data.samples[indices[i]]["disease"] == group]
            clustered, tree = _cluster(display[block], [data.sample_ids[indices[i]] for i in block])
            sample_trees.append({**tree, "group": group})
            order.extend(block[i] for i in clustered)
    else:
        order = base
    samples = [data.samples[indices[i]] for i in order]
    mag_ids = [r["magId"] for r in shown]
    mode = {"abundance": "所选样本平均丰度降序", "variance": "log10(1 + 丰度%) 的总体标准差降序",
            "candidate": "手动清单顺序" if config["candidateKind"] == "manual" else "q 值升序、绝对秩效应量降序"}[config["heatmapMode"]]
    sample_method = {"group": "AD/NC · HPC_Batch · 样本 ID 排序，不聚类", "withinGroup": "AD/NC 各组内部聚类", "cluster": "全部样本聚类，不预设组分隔"}[config["sampleOrder"]]
    methods = {"selection": mode, "sampleOrder": sample_method, "rowOrder": "行聚类" if config["rowOrder"] == "cluster" else "保留选行排序",
               "colorTransform": "按 MAG 在所选样本中对 log10(1 + 丰度%) 作 Z-score；总体标准差 ddof=0" if config["colorMode"] == "rowZ" else "log10(1 + abundance_percent)",
               "clustering": "average linkage · Euclidean · 当前颜色变换后的展示矩阵；无零值替换",
               "varianceMetric": "population standard deviation of log10(1 + abundance_percent), ddof=0",
               "testFamily": "所选样本范围中的全部代表 MAG；热图选行不重新计算 p / BH-FDR q"}
    if config["sampleThreshold"] == 0 and config["minSamplePercent"] > 0 and matrix.size and (matrix > 0).all():
        warnings.append("当前丰度全部大于零，阈值为 0 时所有 MAG 的超过阈值样本比例均为 100%，该条件没有区分作用。")
    if config["colorMode"] == "rowZ" and constant:
        warnings.append(f"{len(constant)} 个 MAG 在当前范围内无变异，以中性色标注，不将其解释为相对升高或降低。")
    identity = {"settings": config, "topN": top_n, "magIds": mag_ids, "sampleIds": [s["sampleId"] for s in samples], "methods": methods}
    fingerprint = hashlib.sha256((data.fingerprint + json.dumps(identity, sort_keys=True)).encode()).hexdigest()
    return {"magIds": mag_ids, "features": shown, "samples": samples, "values": raw[order].tolist(), "displayValues": display[order].tolist(),
            "dendrograms": {"metric": "euclidean", "linkage": "average", "mags": mag_tree, "samples": sample_trees},
            "selection": f"{mode}；{sample_method}。", "settings": {**config, "topN": top_n}, "methods": methods,
            "selectionAudit": {"sourceCount": len(data.mag_ids), "matchedCount": matched, "displayedCount": len(shown),
                               "omittedCount": matched - len(shown), "exclusions": exclusions},
            "warnings": warnings, "constantMagIds": constant, "projectionFingerprint": fingerprint}
