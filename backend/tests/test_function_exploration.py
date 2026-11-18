import hashlib
import json
from unittest.mock import patch

import numpy as np
import pytest

from app.api.diting import FunctionExplorationRequest, exploration
from app.services.function_exploration_service import FORMULA_NAME, exploration_snapshot


def fixture(root):
    names = ['K00368', 'K15864', 'K00001', 'K00002']
    values = np.array([[1,2,3,4,0,0,0,0], [0,0,0,0,1,2,3,4], [0]*8, [1,0,0,0,0,0,0,0]])
    samples = [f'S{i}' for i in range(8)]
    (root/'raw.tab').write_text('\n'.join(['k_number\t'+'\t'.join(samples)] + [n+'\t'+'\t'.join(map(str,v)) for n,v in zip(names,values,strict=True)]))
    (root/'sample_metadata.tsv').write_text('sample_id\tGroup\n'+'\n'.join(f'{s}\t'+('AD' if i<4 else 'NC') for i,s in enumerate(samples)))
    (root/'pathways_relative_abundance.tab').write_text('#Pathway\t'+'\t'.join(samples)+'\n'+FORMULA_NAME+'\t'+'\t'.join(map(str,values[0]+values[1]))+'\nZero\t'+'\t'.join(['0']*8))
    def sha(n):
        return hashlib.sha256((root/n).read_bytes()).hexdigest()
    return {'koSourceSha256':sha('raw.tab'), 'preprocessing':{'pathwaySha256':sha('pathways_relative_abundance.tab'),'sampleMetadataSha256':sha('sample_metadata.tsv')}}


def test_families_mapping_samples_and_excluded_values_are_consistent(tmp_path):
    payload=fixture(tmp_path)
    with patch('app.api.diting._artifact',return_value=(tmp_path/'payload.json',payload)):
        catalog=exploration('x','rev',FunctionExplorationRequest(prevalenceMin=.2))
        assert catalog['record']['koFamilyCount']==2
        assert catalog['record']['pathwayFamilyCount']==2
        assert catalog['pathways'][1]['pValue']==catalog['pathways'][1]['qValue']==1
        json.dumps(catalog, allow_nan=False)
        assert all(r['qValue'] is None for r in catalog['kos'] if not r['tested'])
        detail=exploration('x','rev',FunctionExplorationRequest(feature=FORMULA_NAME,kind='pathway',prevalenceMin=.2))
        assert detail['record']==catalog['record']
        assert detail['mapping']['maxAbsoluteError']==0
        assert len(detail['values'])==8
        assert detail['item']['groups']['AD']['count']==4
        zero=exploration('x','rev',FunctionExplorationRequest(feature='K00001',prevalenceMin=.2))
        assert zero['item']['qValue'] is None and zero['values']==[0]*8
        assert zero['mapping'] is None
        subset=exploration('x','rev',FunctionExplorationRequest(scope={'mode':'subset','sampleCodes':['S0','S1','S2','S4','S5','S6']}))
        assert len(subset['record']['samples'])==6
        assert subset['record']['analysisKey']!=catalog['record']['analysisKey']
        with pytest.raises(Exception,match='所选样本'):
            exploration('x','rev',FunctionExplorationRequest(scope={'mode':'subset','sampleCodes':['S0','missing']}))
    exploration_snapshot.cache_clear()
    (tmp_path/'raw.tab').write_text('changed')
    with patch('app.api.diting._artifact',return_value=(tmp_path/'payload.json',payload)),pytest.raises(Exception,match='校验'):
        exploration('x','rev',FunctionExplorationRequest())


def test_mapping_not_claimed_when_formula_disagrees(tmp_path):
    payload=fixture(tmp_path)
    p=tmp_path/'pathways_relative_abundance.tab'
    p.write_text(p.read_text().replace('1\t2\t3\t4\t1','9\t2\t3\t4\t1'))
    payload['preprocessing']['pathwaySha256']=hashlib.sha256(p.read_bytes()).hexdigest()
    with patch('app.api.diting._artifact',return_value=(tmp_path/'payload.json',payload)):
        detail=exploration('x','rev',FunctionExplorationRequest(feature=FORMULA_NAME,kind='pathway'))
        assert detail['mapping'] is None
    json.dumps(detail,allow_nan=False)
