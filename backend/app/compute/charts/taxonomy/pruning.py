"""Long-tail pruning rules for the canonical taxonomy hierarchy tree."""

from __future__ import annotations

TAXONOMY_TREE_PRUNE_RULES = {
    "phylum": {"limit": 24, "min_ratio": 0.001, "other": "Other phyla"},
    "class": {"limit": 12, "min_ratio": 0.003, "other": "Other classes"},
    "genus": {"limit": 12, "min_ratio": 0.004, "other": "Other genera"},
    "species": {"limit": 4, "min_ratio": 0.008, "other": "Other species"},
}


def _sum_tree_values(node: dict) -> float:
    children = node.get("children") or []
    if not children:
        return float(node.get("value", 0))
    node["value"] = sum(_sum_tree_values(child) for child in children)
    return float(node["value"])


def _prune_taxonomy_tree_children(children: list[dict], rank: str, parent_total: float) -> list[dict]:
    if not children:
        return []

    rule = TAXONOMY_TREE_PRUNE_RULES[rank]
    children.sort(key=lambda item: item.get("value", 0), reverse=True)
    parent_total = parent_total or sum(float(child.get("value", 0)) for child in children) or 1.0

    visible = []
    hidden = []
    for index, child in enumerate(children):
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


__all__ = ["TAXONOMY_TREE_PRUNE_RULES", "_prune_taxonomy_tree_children", "_sum_tree_values"]
