import numpy as np
import pandas as pd
import pytest

from app.compute.charts.composition import compute_phylum_composition


def input_frame():
    features = ['k__Bacteria|p__Firmicutes|s__A', 'k__Bacteria|p__Firmicutes|s__B',
                'k__Bacteria|p__Rare|s__C', 'k__Archaea|s__Unknown']
    frame = pd.DataFrame({'Sample': ['a', 'b', 'c'], 'Group': ['AD', 'AD', 'NC'],
        features[0]: [0.4, 0.2, 0], features[1]: [0.1, 0, 0.3],
        features[2]: [1e-10, 0, 2e-10], features[3]: [0.01, 0, 0.03]})
    frame.attrs.update(feature_kind='taxonomy', abundance_scale='relative_abundance')
    series = [{'key': group, 'group': group, 'label': group} for group in ['AD', 'NC']]
    return frame, features, series


def test_complete_sample_and_group_values_preserve_source_totals_and_zeroes():
    frame, features, series = input_frame()
    result = compute_phylum_composition(frame, features, series)
    assert result['sourceCategoryCount'] == 3
    assert result['mergedCategoryCount'] == 0
    assert {row['feature'] for row in result['items']} == {'Firmicutes', 'Rare', 'Unclassified'}
    assert result['semantics']['unclassifiedSpeciesCount'] == 1
    for index, sample in enumerate(result['samples']):
        assert sum(sample['values'].values()) == pytest.approx(frame[features].iloc[index].sum())
    firmicutes = next(row for row in result['items'] if row['feature'] == 'Firmicutes')
    assert firmicutes['values']['AD'] == pytest.approx(0.35)
    distribution = next(row for row in result['distributions']['items'] if row['featureId'] == 'Firmicutes')
    assert distribution['groupStats']['AD']['sampleCount'] == 2
    assert distribution['groupStats']['NC']['sampleCount'] == 1
    assert result['semantics']['closure'] == 'none'
    assert next(row for row in result['items'] if row['feature'] == 'Rare')['values']['AD'] > 0


def test_explicit_merge_and_audit_preserve_mass_and_original_exports():
    frame, features, series = input_frame()
    result = compute_phylum_composition(frame, features, series, 0.001)
    assert result['merge']['members'] == ['Rare']
    assert result['displayedCategoryCount'] == 3  # two direct phyla + explicit aggregate
    assert result['mergedCategoryCount'] == 1
    assert len(result['sourceItems']) == 3
    for original, plotted in zip(result['sourceSamples'], result['samples'], strict=True):
        assert sum(original['values'].values()) == pytest.approx(sum(plotted['values'].values()))
        assert 'Rare' in original['values']
    audit = next(row for row in result['_aggregationRows'] if row['feature'] == 'Rare')
    assert audit['status'] == 'merged'
    assert audit['destination'] == result['merge']['destination']
    assert audit['series_0'] == pytest.approx(5e-11)


def test_no_invented_percent_unit_or_silent_closure_for_unknown_input():
    frame, features, series = input_frame()
    frame.attrs['abundance_scale'] = 'unknown'
    frame[features] *= 1000
    result = compute_phylum_composition(frame, features, series)
    assert result['semantics']['abundanceScale'] == 'unknown'
    assert result['samples'][0]['values']['Firmicutes'] == pytest.approx(500)
    with pytest.raises(ValueError, match='declared relative-abundance'):
        compute_phylum_composition(frame, features, series, 0.01)


@pytest.mark.parametrize('bad', [-1, np.nan, np.inf])
def test_invalid_source_values_fail_closed(bad):
    frame, features, series = input_frame()
    frame.loc[0, features[0]] = bad
    with pytest.raises(ValueError, match='finite non-negative'):
        compute_phylum_composition(frame, features, series)
