"""Compatibility wrapper for the taxonomy hierarchy chart domain.

New code should import from app.compute.charts.taxonomy. This module remains so
older tests, imports, and cache-generation paths keep working during migration.
"""

from __future__ import annotations

from .taxonomy import (
    TAXONOMY_TREE_PRUNE_RULES,
    _prune_taxonomy_tree_children,
    _sum_tree_values,
    compute_sunburst,
    compute_taxonomy_hierarchy,
    compute_taxonomy_sankey_projection,
    compute_taxonomy_tree,
)

__all__ = [
    "TAXONOMY_TREE_PRUNE_RULES",
    "_prune_taxonomy_tree_children",
    "_sum_tree_values",
    "compute_sunburst",
    "compute_taxonomy_hierarchy",
    "compute_taxonomy_sankey_projection",
    "compute_taxonomy_tree",
]
