"""Chart-specific projections derived from the canonical taxonomy hierarchy."""

from __future__ import annotations

from .colors import SANKEY_LEVEL_COLORS

SANKEY_LABEL_ROW_HEIGHT = 18
SANKEY_VERTICAL_PADDING = 160
SANKEY_COLUMN_BUDGETS = {0: 12, 1: 32, 2: 96, 3: 160}
SANKEY_REAL_CHILD_LIMITS = {0: 11, 1: 4, 2: 3, 3: 2}
SANKEY_RANKS = ("phylum", "class", "genus", "species")
SANKEY_OTHER_LABELS = {
    "phylum": "Other phyla",
    "class": "Other classes",
    "genus": "Other genera",
    "species": "Other species",
}


def _node_value(item: dict) -> float:
    return float(item.get("value", 0) or 0)


def _node_sort_key(item: dict) -> tuple[float, str]:
    return (-_node_value(item), str(item.get("name") or "Unknown"))


def _is_aggregate_node(item: dict, other_label: str) -> bool:
    return (
        str(item.get("name") or "") == other_label
        or int(item.get("mergedCount", 0) or 0) > 0
    )


def _hidden_category_count(item: dict, other_label: str) -> int:
    merged_count = int(item.get("mergedCount", 0) or 0)
    if _is_aggregate_node(item, other_label):
        return max(1, merged_count)
    return 1 + merged_count


def _copy_projection_node(item: dict) -> dict:
    return {
        "name": item.get("name") or "Unknown",
        "rank": item.get("rank", ""),
        "value": _node_value(item),
        "mergedCount": int(item.get("mergedCount", 0) or 0),
    }


def _aggregate_hidden_nodes(items: list[dict], rank: str) -> dict:
    other_label = SANKEY_OTHER_LABELS[rank]
    return {
        "name": other_label,
        "rank": rank,
        "value": sum(_node_value(item) for item in items),
        "mergedCount": sum(_hidden_category_count(item, other_label) for item in items),
    }


def _project_taxonomy_for_sankey(tree: list[dict]) -> list[dict]:
    """Build a bounded Sankey-only tree without mutating the canonical tree."""

    root: dict = {"children": []}
    parent_groups: list[tuple[dict, list[dict]]] = [(root, list(tree))]

    for depth, rank in enumerate(SANKEY_RANKS):
        if not parent_groups:
            break

        budget = SANKEY_COLUMN_BUDGETS[depth]
        real_limit = SANKEY_REAL_CHILD_LIMITS[depth]
        other_label = SANKEY_OTHER_LABELS[rank]
        prepared: list[dict] = []

        for group_index, (projected_parent, source_children) in enumerate(parent_groups):
            actual_children: list[dict] = []
            aggregate_children: list[dict] = []
            for child in sorted(source_children, key=_node_sort_key):
                if _is_aggregate_node(child, other_label):
                    aggregate_children.append(child)
                else:
                    actual_children.append(child)

            candidates = actual_children[:real_limit]
            prepared.append(
                {
                    "group_index": group_index,
                    "projected_parent": projected_parent,
                    "candidates": candidates,
                    "fixed_hidden": [*actual_children[real_limit:], *aggregate_children],
                }
            )

        # Every parent with children starts as one aggregate node. We then
        # expose the most abundant real children globally until the column
        # budget is exhausted. Cascading budgets guarantee this baseline fits.
        selected_counts = [0] * len(prepared)
        used_slots = sum(
            1
            for group in prepared
            if group["candidates"] or group["fixed_hidden"]
        )
        if used_slots > budget:
            raise ValueError(
                f"Sankey column {depth} requires {used_slots} baseline slots; budget is {budget}."
            )

        operations: list[tuple[float, str, int, int]] = []
        for group_index, group in enumerate(prepared):
            for candidate_index, candidate in enumerate(group["candidates"]):
                operations.append(
                    (
                        -_node_value(candidate),
                        str(candidate.get("name") or "Unknown"),
                        group_index,
                        candidate_index,
                    )
                )
        operations.sort()

        for _, _, group_index, candidate_index in operations:
            if candidate_index != selected_counts[group_index]:
                continue
            group = prepared[group_index]
            candidates = group["candidates"]
            fixed_hidden = group["fixed_hidden"]
            current_count = selected_counts[group_index]
            current_output_count = current_count + int(
                bool(fixed_hidden or len(candidates) > current_count)
            )
            next_count = current_count + 1
            next_output_count = next_count + int(
                bool(fixed_hidden or len(candidates) > next_count)
            )
            slot_delta = next_output_count - current_output_count
            if used_slots + slot_delta <= budget:
                selected_counts[group_index] = next_count
                used_slots += slot_delta

        next_parent_groups: list[tuple[dict, list[dict]]] = []
        for group_index, group in enumerate(prepared):
            selected_count = selected_counts[group_index]
            candidates = group["candidates"]
            selected = candidates[:selected_count]
            hidden = [*candidates[selected_count:], *group["fixed_hidden"]]
            projected_children: list[dict] = []

            for source_child in selected:
                projected_child = _copy_projection_node(source_child)
                projected_children.append(projected_child)
                source_grandchildren = source_child.get("children") or []
                if source_grandchildren and depth + 1 < len(SANKEY_RANKS):
                    next_parent_groups.append((projected_child, source_grandchildren))

            if hidden:
                projected_children.append(_aggregate_hidden_nodes(hidden, rank))

            group["projected_parent"]["children"] = projected_children

        parent_groups = next_parent_groups

    return root["children"]


def compute_taxonomy_sankey_projection(tree: list[dict]) -> dict:
    """Build the ECharts Sankey projection for the taxonomy hierarchy tree."""

    nodes: list[dict] = []
    links: list[dict] = []
    seen: set[str] = set()
    depth_counts: dict[int, int] = {}

    def walk(items: list[dict], parent_id: str | None = None, depth: int = 0, path: list[str] | None = None) -> None:
        current_path = path or []
        for index, item in enumerate(items):
            label = item.get("name") or "Unknown"
            node_path = f"{depth}:{index}:{label}"
            node_id = "/".join([*current_path, node_path])

            if node_id not in seen:
                seen.add(node_id)
                depth_counts[depth] = depth_counts.get(depth, 0) + 1
                nodes.append(
                    {
                        "name": node_id,
                        "label": label,
                        "rank": item.get("rank", ""),
                        "depth": depth,
                        "value": float(item.get("value", 0) or 0),
                        "mergedCount": int(item.get("mergedCount", 0) or 0),
                        "itemStyle": {"color": SANKEY_LEVEL_COLORS[depth % len(SANKEY_LEVEL_COLORS)]},
                    }
                )

            if parent_id:
                links.append(
                    {
                        "source": parent_id,
                        "target": node_id,
                        "value": float(item.get("value", 0) or 0),
                    }
                )

            children = item.get("children") or []
            if children:
                walk(children, node_id, depth + 1, [*current_path, node_path])

    walk(_project_taxonomy_for_sankey(tree))
    max_depth = max(depth_counts.keys(), default=0)
    max_column_count = max(depth_counts.values(), default=1)
    height = max(1180, max_column_count * SANKEY_LABEL_ROW_HEIGHT + SANKEY_VERTICAL_PADDING)
    width = min(3600, max(2200, (max_depth + 1) * 520))
    node_gap = max(7, min(14, height // (max_column_count + 28)))

    return {
        "kind": "taxonomy_sankey",
        "source": "taxonomy",
        "nodes": nodes,
        "links": links,
        "layout": {
            "width": width,
            "height": height,
            "nodeGap": node_gap,
            "maxDepth": max_depth,
            "maxColumnCount": max_column_count,
        },
    }


__all__ = [
    "SANKEY_COLUMN_BUDGETS",
    "SANKEY_LABEL_ROW_HEIGHT",
    "SANKEY_REAL_CHILD_LIMITS",
    "SANKEY_VERTICAL_PADDING",
    "compute_taxonomy_sankey_projection",
]
