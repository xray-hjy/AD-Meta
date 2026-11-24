"""Per-MAG manual-list feedback must describe the actual selection pipeline."""
from types import SimpleNamespace

import numpy as np

from app.services.mag_heatmap_service import build_heatmap


def test_manual_list_reports_first_filter_and_display_cap_without_reordering_or_changing_values():
    data = SimpleNamespace(mag_ids=['A', 'B', 'C'], matrix=np.array([[0.123456789, 0, 3], [0, 2, 4]]),
                           samples=[{'sampleId': 's1', 'disease': 'AD', 'batch': '1'},
                                    {'sampleId': 's2', 'disease': 'NC', 'batch': '2'}],
                           sample_ids=['s1', 's2'], fingerprint='source')
    rows = [{'magId': mag_id, 'taxonomy': {}, 'meanPercent': 1, 'completenessPercent': quality,
             'contaminationPercent': 0, 'qValue': .8, 'rankBiserial': 0}
            for mag_id, quality in [('A', 95), ('B', 70), ('C', 90)]]
    config = {'heatmapMode': 'candidate', 'candidateKind': 'manual', 'heatmapIds': 'A\nB\nC', 'minCompleteness': 80}
    result = build_heatmap(data, [0, 1], rows, 1, config)
    assert result['magIds'] == ['A']
    assert result['values'] == [[.123456789], [0]]
    feedback = {row['magId']: row for row in result['selectionAudit']['requestedMagResults']}
    assert feedback['A']['displayed'] is True
    assert '质量条件' in feedback['B']['reason']
    assert '≥80%' in feedback['B']['reason']
    assert '显示上限 1' in feedback['C']['reason']
    assert rows[0]['qValue'] == .8  # Manual selection does not apply a significance filter.
    assert build_heatmap(data, [0, 1], rows, 0, config)['magIds'] == ['A', 'C']
    empty = build_heatmap(data, [], rows, 1, config)
    assert {row['reason'] for row in empty['selectionAudit']['requestedMagResults']} == {'当前样本范围为空'}
