"""Canonical taxonomy hierarchy payload.

This module owns the factual phylum -> class -> genus -> species tree. Concrete
chart payloads should be derived from this tree in projections.py.
"""

from __future__ import annotations

import pandas as pd

from app.compute.taxonomy import taxonomy_chain

from .pruning import _prune_taxonomy_tree_children


def compute_taxonomy_hierarchy(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    if df.attrs.get("feature_kind") == "ko":
        return []

    totals = df[species_cols].sum(axis=0)
    tree: dict[str, dict] = {}

    for col in species_cols:
        value = float(totals[col])
        if value <= 0:
            continue

        chain = taxonomy_chain(col)
        phylum = chain["phylum"]
        cls = chain["class"]
        genus = chain["genus"]
        species = chain["species"]

        p_node = tree.setdefault(phylum, {"name": phylum, "rank": "phylum", "children": {}})
        c_node = p_node["children"].setdefault(cls, {"name": cls, "rank": "class", "children": {}})
        g_node = c_node["children"].setdefault(genus, {"name": genus, "rank": "genus", "children": {}})
        s_node = g_node["children"].setdefault(species, {"name": species, "rank": "species", "value": 0.0})
        s_node["value"] += value

    def materialize_full(node: dict) -> dict:
        children_map = node.get("children")
        if not children_map:
            return {"name": node["name"], "rank": node.get("rank", "species"), "value": node.get("value", 0.0)}

        children = [materialize_full(child) for child in children_map.values()]
        value = sum(float(child.get("value", 0)) for child in children)
        child_rank = children[0].get("rank", "species")
        children = _prune_taxonomy_tree_children(children, child_rank, value)
        return {
            "name": node["name"],
            "rank": node.get("rank", "phylum"),
            "value": value,
            "children": children,
        }

    roots = [materialize_full(node) for node in tree.values()]
    roots = _prune_taxonomy_tree_children(
        roots,
        "phylum",
        sum(float(root.get("value", 0)) for root in roots),
    )
    return roots


def compute_taxonomy_tree(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    """Backward-compatible alias for the canonical taxonomy hierarchy payload."""

    return compute_taxonomy_hierarchy(df, species_cols)


def compute_sunburst(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    """Deprecated compatibility alias for older sunburst imports."""

    return compute_taxonomy_hierarchy(df, species_cols)


__all__ = ["compute_sunburst", "compute_taxonomy_hierarchy", "compute_taxonomy_tree"]
