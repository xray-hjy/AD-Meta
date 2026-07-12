"""Shared colors for taxonomy hierarchy visualizations.

The taxonomy palette follows the existing frontend hierarchy colors. Sankey keeps
its own projection palette because flow depth colors need stronger contrast.
"""

from __future__ import annotations

TAXONOMY_LEVEL_COLORS = [
    "#3B82F6",
    "#06B6D4",
    "#22C55E",
    "#FACC15",
    "#FB923C",
    "#F43F5E",
    "#A78BFA",
    "#14B8A6",
    "#F472B6",
    "#84CC16",
]

TAXONOMY_OTHER_COLOR = "#94a3b8"

SANKEY_LEVEL_COLORS = [
    "#3B82F6",
    "#14B8A6",
    "#F97316",
    "#A855F7",
    "#EC4899",
]

__all__ = ["SANKEY_LEVEL_COLORS", "TAXONOMY_LEVEL_COLORS", "TAXONOMY_OTHER_COLOR"]
