import json

import numpy as np
import pandas as pd
import pytest

from app.compute.charts.detection import compute_detection_heatmap


def test_all_source_detection_is_independent_of_top_n_with_real_group_denominators():
    df = pd.DataFrame({'Sample': ['A1','A2','A3','N1','N2'], 'Group':['AD']*3+['NC']*2,
                       'K00001':[1,0,2,0,3], 'K00002':[0]*5, 'K00003':[1]*5})
    one = compute_detection_heatmap(df, list(df.columns[2:]), top_n=1, include_audit=True)
    many = compute_detection_heatmap(df, list(df.columns[2:]), top_n=200)
    assert one['allItems'] == many['allItems']
    row = one['allItems'][0]
    assert row['adDetectedSamples']==2 and row['adSampleCount']==3
    assert row['ncDetectedSamples']==1 and row['ncSampleCount']==2
    assert row['rateGapPercentagePoints']==pytest.approx((2/3-1/2)*100)
    assert one['allItems'][1]['overallDetectionRate']==0
    assert one['allItems'][2]['overallDetectionRate']==1
    assert len(one['items'])==1 and len(many['items'])==2
    subset = compute_detection_heatmap(df.iloc[[0,1,3]], list(df.columns[2:]))
    assert subset['allItems'][0]['adSampleCount']==2
    assert subset['allItems'][0]['ncSampleCount']==1
    json.dumps(one, allow_nan=False)


@pytest.mark.parametrize('invalid', [np.nan,np.inf,-1])
def test_detection_does_not_silently_treat_invalid_abundance_as_absence(invalid):
    df=pd.DataFrame({'Sample':['A','N'],'Group':['AD','NC'],'K00001':[invalid,1]})
    with pytest.raises(ValueError,match='不能静默'):
        compute_detection_heatmap(df,['K00001'])
