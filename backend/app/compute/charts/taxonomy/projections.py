"""Chart-specific projections derived from the canonical taxonomy hierarchy."""

from __future__ import annotations

from .colors import SANKEY_LEVEL_COLORS

SANKEY_LABEL_ROW_HEIGHT = 21
SANKEY_VERTICAL_PADDING = 180


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

    walk(tree)
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


__all__ = ["SANKEY_LABEL_ROW_HEIGHT", "SANKEY_VERTICAL_PADDING", "compute_taxonomy_sankey_projection"]
