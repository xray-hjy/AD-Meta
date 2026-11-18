from copy import deepcopy

import numpy as np
import pandas as pd
import pytest

from app.compute.charts.taxonomy.hierarchy import compute_taxonomy_hierarchy
from app.compute.charts.taxonomy.projections import compute_taxonomy_sankey_projection


def test_tree_and_sankey_other_members_retain_exact_values_without_mutating_source():
    features = [f'k__Bacteria|p__P{i}|c__C{i}|g__G{i}|s__S{i}' for i in range(40)]
    frame = pd.DataFrame([{'Sample': f'S{sample}', 'Group': 'AD', **{feature: float(40 - index) / 820 for index, feature in enumerate(features)}} for sample in range(3)])
    frame.attrs['feature_kind'] = 'taxonomy'
    tree = compute_taxonomy_hierarchy(frame, features)
    np.testing.assert_allclose(sum(node['value'] for node in tree), 3)
    def check(nodes):
        found = 0
        for node in nodes:
            if node.get('sourceMembers'):
                assert sum(member['value'] for member in node['sourceMembers']) == pytest.approx(node['value'])
                found += 1 + check(node['sourceMembers'])
            found += check(node.get('children', []))
        return found
    assert check(tree) > 0
    before = deepcopy(tree)
    sankey = compute_taxonomy_sankey_projection(tree)
    assert tree == before
    roots = [node for node in sankey['nodes'] if node['depth'] == 0]
    assert sum(node['value'] for node in roots) == pytest.approx(3)
    assert check(sankey['nodes']) > 0
    assert any(node.get('aggregationKind') == 'sankey_layout_compression' for node in sankey['nodes'])
    assert all(node.get('fullPath') for node in sankey['nodes'])
