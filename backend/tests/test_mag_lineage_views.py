from types import SimpleNamespace

import pytest

from app.api import mag
from app.domain.mag import MagScope
from app.services import mag_analysis_service as service


@pytest.fixture
def lineage(monkeypatch):
    summaries = [{'clusterId': f'c{i}', 'representativeMag': f'M{i}', 'memberCount': size,
                  'sourceSampleCount': size, 'gtdbSpecies': 'Species A', 'mappingStatus': 'exact',
                  'below095AniCount': 2 if size == 142 else 0}
                 for i, size in enumerate([1, 2, 5, 6, 20, 21, 142])]
    members = [{'clusterId': 'c6', 'memberMag': f'member-{i}', 'memberSourceSampleId': f's{i}',
                'memberToRepAni': .949000012345 if i < 2 else 1,
                'memberToRepAlignmentCoverage': .3333333333333333, 'memberDisease': 'AD', 'memberGroup': 'CHN'}
               for i in range(142)]
    monkeypatch.setattr(service, '_require_capability', lambda *_: None)
    monkeypatch.setattr(service, 'lineage_cluster_summaries', lambda _: summaries)
    monkeypatch.setattr(service, 'provenance', lambda *_: {})
    return SimpleNamespace(lineage=members, mag_ids=[row['representativeMag'] for row in summaries])


def test_distribution_is_over_all_matches_not_page_or_selected_bin(lineage):
    result = service.lineage_cluster_page(lineage, MagScope(), limit=2)
    assert [item['count'] for item in result['sizeDistribution']] == [1, 2, 2, 2]
    assert sum(item['count'] for item in result['sizeDistribution']) == result['matchedTotal'] == 7
    assert len(result['items']) == 2
    next_page = service.lineage_cluster_page(lineage, MagScope(), limit=2, offset=2)
    assert next_page['sizeDistribution'] == result['sizeDistribution']
    narrowed = service.lineage_cluster_page(lineage, MagScope(), size_bin='21+')
    assert narrowed['total'] == 2
    assert narrowed['sizeDistribution'] == result['sizeDistribution']
    low = service.lineage_cluster_page(lineage, MagScope(), low_ani_only=True)
    assert [item['count'] for item in low['sizeDistribution']] == [0, 0, 0, 1]
    assert service.lineage_cluster_page(lineage, MagScope(), query='absent')['matchedTotal'] == 0
    assert service.lineage_cluster_page(lineage, MagScope(), mapping_status='missing')['total'] == 0
    with pytest.raises(ValueError):
        service.lineage_cluster_page(lineage, MagScope(), size_bin='invalid')


def test_all_members_and_exact_ids_keep_boundary_values_and_are_independent_of_table_page(lineage):
    full = service.lineage_cluster_detail(lineage, MagScope(), 'c6', limit=len(lineage.lineage))
    assert full['total'] == len(full['items']) == 142
    assert sum(row['memberToRepAni'] < .95 for row in full['items']) == 2
    page = service.lineage_cluster_detail(lineage, MagScope(), 'c6', limit=25, offset=25)
    assert len(page['items']) == 25
    low = service.lineage_cluster_detail(lineage, MagScope(), 'c6', low_ani_only=True)
    assert low['total'] == 2
    exact = service.lineage_cluster_detail(lineage, MagScope(), 'c6', query='member-1')
    assert exact['total'] == 1  # Must not include member-10, member-11, etc.
    assert exact['items'][0]['memberToRepAni'] == .949000012345
    assert exact['items'][0]['memberToRepAlignmentCoverage'] == .3333333333333333


def test_all_members_api_flag_overrides_pagination_only(lineage):
    result = mag.lineage_cluster('c6', lineage, MagScope(), query='', member_disease='', source_group='',
                                low_ani_only=False, sort_by='memberToRepAni', direction='asc', limit=1, offset=100,
                                all_members=True)
    assert len(result['items']) == result['total'] == 142
    assert result['offset'] == 0
