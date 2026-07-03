"""分类旭日图/矩形树图数据计算。

物种数据会被组织成 phylum -> class -> genus -> species 的层级树。
前端可用同一份树数据渲染 ECharts sunburst 或 treemap。KO 数据理论上
也可复用树结构，但当前 `precompute_all` 只给物种数据生成 sunburst。
"""

from __future__ import annotations

import pandas as pd

from app.compute.taxonomy import short_name, taxonomy_chain


def _sum_tree_values(node: dict) -> float:
    """自底向上汇总树节点 value。

    叶子节点已经有 value；内部节点的 value 是所有子节点之和。
    """

    children = node.get("children") or []
    if not children:
        return float(node.get("value", 0))
    node["value"] = sum(_sum_tree_values(child) for child in children)
    return float(node["value"])


# 各层级的裁剪规则。层级越深，限制越严格，避免前端标签过密。
SUNBURST_PRUNE_RULES = {
    "phylum": {"limit": 6, "min_ratio": 0.02, "other": "Other phyla"},
    "class": {"limit": 4, "min_ratio": 0.05, "other": "Other classes"},
    "genus": {"limit": 4, "min_ratio": 0.05, "other": "Other genera"},
    "species": {"limit": 3, "min_ratio": 0.08, "other": "Other species"},
}


def _prune_taxonomy_children(children: list[dict], rank: str, parent_total: float) -> list[dict]:
    """按层级规则裁剪子节点，并把被隐藏节点合并成 Other。

    这样可以保留主要分类，同时保证父节点总值不变。`mergedCount` 记录被合并
    的节点数量，方便前端 tooltip 说明。
    """

    if not children:
        return []

    rule = SUNBURST_PRUNE_RULES[rank]
    children.sort(key=lambda item: item.get("value", 0), reverse=True)
    parent_total = parent_total or sum(float(child.get("value", 0)) for child in children) or 1.0

    visible = []
    hidden = []
    for index, child in enumerate(children):
        # 除了数量上限，也要求占父节点比例足够大；每层至少保留第一名。
        value = float(child.get("value", 0))
        ratio = value / parent_total
        child["ratio"] = ratio
        keep = index < rule["limit"] and (ratio >= rule["min_ratio"] or index == 0)
        if keep:
            visible.append(child)
        else:
            hidden.append(child)

    hidden_value = sum(float(child.get("value", 0)) for child in hidden)
    if hidden_value > 0:
        visible.append(
            {
                "name": rule["other"],
                "rank": rank,
                "value": hidden_value,
                "ratio": hidden_value / parent_total,
                "mergedCount": len(hidden),
            }
        )

    return visible


def _prune_children(children: list[dict], limit: int, other_name: str) -> list[dict]:
    """普通列表裁剪工具，主要给 KO 兜底树使用。"""

    children.sort(key=lambda item: item.get("value", 0), reverse=True)
    if len(children) <= limit:
        return children
    visible = children[:limit]
    hidden = children[limit:]
    hidden_value = sum(child.get("value", 0) for child in hidden)
    if hidden_value > 0:
        visible.append({"name": other_name, "value": hidden_value})
    return visible


def compute_sunburst(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    """构建 ECharts 可直接消费的分类层级树。

    物种输入列名中包含 k__/p__/c__/g__/s__ 层级信息；函数把每个特征总丰度
    累加到对应叶子节点，再逐层汇总和裁剪。
    """

    totals = df[species_cols].sum(axis=0)

    if df.attrs.get("feature_kind") == "ko":
        # KO 没有分类链，这里保留一个平铺兜底树，便于未来需要时复用。
        children = [
            {"name": short_name(col), "value": float(totals[col])}
            for col in totals.sort_values(ascending=False).head(40).index
            if float(totals[col]) > 0
        ]
        root = {
            "name": "KO Features",
            "children": _prune_children(children, 24, "Other"),
        }
        _sum_tree_values(root)
        return [root]

    tree: dict[str, dict] = {}

    for col in species_cols:
        # 跳过全 0 特征，避免树里出现没有面积的叶子。
        value = float(totals[col])
        if value <= 0:
            continue
        chain = taxonomy_chain(col)
        phylum = chain["phylum"]
        cls = chain["class"]
        genus = chain["genus"]
        species = chain["species"]

        # 用嵌套 dict 先累积树，最后再 materialize 成 ECharts 需要的 list children。
        p_node = tree.setdefault(phylum, {"name": phylum, "rank": "phylum", "children": {}})
        c_node = p_node["children"].setdefault(cls, {"name": cls, "rank": "class", "children": {}})
        g_node = c_node["children"].setdefault(genus, {"name": genus, "rank": "genus", "children": {}})
        s_node = g_node["children"].setdefault(species, {"name": species, "rank": "species", "value": 0.0})
        s_node["value"] += value

    def materialize(node: dict, depth: int = 0) -> dict:
        """把内部 dict 树转换成前端需要的 children list 结构。"""

        children_map = node.get("children")
        if not children_map:
            return {"name": node["name"], "rank": node.get("rank", "species"), "value": node.get("value", 0.0)}

        children = [materialize(child, depth + 1) for child in children_map.values()]
        value = sum(float(child.get("value", 0)) for child in children)
        child_rank = children[0].get("rank", "species")
        children = _prune_taxonomy_children(children, child_rank, value)
        materialized = {
            "name": node["name"],
            "rank": node.get("rank", "phylum"),
            "value": value,
            "children": children,
        }
        return materialized

    # 根层也是多个 phylum，所以返回的是 root list，而不是单个根节点。
    roots = [materialize(node, 0) for node in tree.values()]
    roots = _prune_taxonomy_children(roots, "phylum", sum(float(root.get("value", 0)) for root in roots))
    return roots
