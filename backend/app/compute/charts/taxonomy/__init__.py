"""Taxonomy hierarchy chart domain.

The canonical taxonomy tree is the stable backend data model. Chart-specific
payloads, such as Sankey nodes/links, are projections derived from that tree.
"""

from __future__ import annotations

from .colors import SANKEY_LEVEL_COLORS, TAXONOMY_LEVEL_COLORS, TAXONOMY_OTHER_COLOR
from .hierarchy import compute_sunburst, compute_taxonomy_hierarchy, compute_taxonomy_tree
from .projections import compute_taxonomy_sankey_projection
from .pruning import TAXONOMY_TREE_PRUNE_RULES, _prune_taxonomy_tree_children, _sum_tree_values

__all__ = [
    "SANKEY_LEVEL_COLORS",
    "TAXONOMY_LEVEL_COLORS",
    "TAXONOMY_OTHER_COLOR",
    "TAXONOMY_TREE_PRUNE_RULES",
    "_prune_taxonomy_tree_children",
    "_sum_tree_values",
    "compute_sunburst",
    "compute_taxonomy_hierarchy",
    "compute_taxonomy_sankey_projection",
    "compute_taxonomy_tree",
]
