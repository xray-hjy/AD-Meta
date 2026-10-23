"""Small independent scientific checks; no full cohort/browser regression suite."""
import sqlite3
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import mag as api
from app.domain.mag import MagDataset, MagScope
from app.services import mag_function_service as service
from app.services import mag_function_store as store


@pytest.fixture
def data(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'STORAGE_ROOT', tmp_path)
    path = tmp_path / 'derived/mag-functions/tiny.sqlite'
    path.parent.mkdir(parents=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(store.SCHEMA)
        conn.executemany('INSERT INTO mags VALUES (?,?,?,?,?,?)', [
            (1, 'M1', 'Bacteria', 2, 100, '{}'), (2, 'M2', 'Archaea', 1, 100, '{}')])
        conn.executemany('INSERT INTO features VALUES (?,?,?,?)', [(1, 'kofam_ko', 'K00929', 'butyrate kinase'), (2, 'kofam_ko', 'K01580', 'glutamate decarboxylase')])
        conn.executemany('INSERT INTO counts VALUES (?,?,?)', [(1, 1, 2), (2, 2, 1)])
        conn.executemany('INSERT INTO genes VALUES (?,?,?,?,?,?,?,?,?)', [
            (1, 'M1_c1_1', 1, 'c1', 10, 100, 1, 'E', '{}'), (2, 'M1_c1_2', 1, 'c1', 200, 150, -1, 'E', '{}'),
            (3, 'M2_c1_1', 2, 'c1', 10, 100, 1, 'D', '{}')])
        conn.executemany('INSERT INTO hits VALUES (?,?,?)', [(1, 1, 1), (1, 2, 1), (2, 3, 2)])
    reference = {'file': path.relative_to(tmp_path).as_posix(), 'sha256': store.sha256(path), 'bytes': path.stat().st_size}
    samples = tuple({'sampleId': f'S{i}', 'disease': 'AD' if i < 2 else 'NC', 'gender': 'F', 'batch': 'A', 'age': 60} for i in range(4))
    return MagDataset(root=Path(tmp_path), version='tiny', fingerprint='tiny-release', sample_ids=tuple(r['sampleId'] for r in samples),
                      mag_ids=('M1', 'M2'), samples=samples, lengths=(300, 200), sources=(), max_mapping_error=0,
                      matrix=np.array([[3, 1], [4, 0], [0, 2], [1, 2]], dtype=float),
                      modules={'metabolism': {'revision': 'tiny-annotation', 'status': 'ready', 'database': reference,
                                               'coordinateConvention': 'raw'}})


def test_best_hit_parsing_keeps_namespaces_and_ignores_missing_tokens():
    result = store.features({'kofam_id': 'K00929', 'kofam_EC': 'EC:2.7.2.7', 'dbcan_id': 'GH1;GH1',
                             'dbcan_sub_substrate': '-;starch and cellulose', 'merops_id': 'M01.001'})
    assert result['kofam_ko'] == {'K00929'}
    assert result['kofam_ec'] == {'EC:2.7.2.7'}
    assert result['dbcan_family'] == {'GH1'}
    assert result['dbcan_substrate'] == {'starch and cellulose'}


def test_matrix_preserves_requested_identity_and_zero(data):
    result = service.matrix(data, feature_ids='K01580,K00929', mag_ids='M2,M1', mag_limit=2, feature_limit=2)
    assert [r['magId'] for r in result['mags']] == ['M2', 'M1']
    assert [r['featureId'] for r in result['features']] == ['K01580', 'K00929']
    assert result['values'] == [[1, 0], [0, 2]]
    assert result['scopeKind'] == 'catalog'


def test_carrier_statistics_keep_full_mag_family_and_samples(data):
    result = service.carriers(data, MagScope(), 'kofam_ko', 'K00929')
    assert result['total'] == 1 and result['items'][0]['geneCount'] == 2
    assert result['items'][0]['adMeanPercent'] == 3.5
    assert result['testFamily'] == 2
    assert service.carriers(data, MagScope(disease='NC'), 'kofam_ko', 'K00929')['items'][0]['qValue'] is None


def test_gene_interval_retains_reverse_and_cross_boundary_genes(data):
    result = service.genes(data, 'M1', 'kofam_ko', 'K00929', contig='c1', start=90, stop=160)
    assert result['total'] == 2
    assert result['items'][1]['strand'] == -1
    assert result['items'][1]['start'] == 200
    assert result['hasSequence'] is False


def test_signals_retain_percent_scale_and_distinguish_gene_weighting(data):
    carrier = service.signals(data, MagScope(), feature_id='K00929', kind='carriers')
    copies = service.signals(data, MagScope(), feature_id='K00929', kind='copies')
    assert [r['value'] for r in carrier['samples']] == [3, 4, 0, 1]
    assert [r['value'] for r in copies['samples']] == [6, 8, 0, 2]
    assert carrier['testFamily'] == copies['testFamily'] == 2
    assert carrier['projectionFingerprint'] != copies['projectionFingerprint']
    assert carrier['projectionFingerprint'] != service.signals(data, MagScope(), feature_id='K01580')['projectionFingerprint']


def test_artifact_tampering_is_rejected(data, tmp_path):
    path = tmp_path / data.modules['metabolism']['database']['file']
    with path.open('ab') as handle:
        handle.write(b'changed')
    with pytest.raises(ValueError, match='size mismatch'):
        service.feature_rows(data, 'kofam_ko')


def test_unknown_manual_ids_are_not_silently_replaced(data):
    with pytest.raises(ValueError):
        service.matrix(data, mag_ids='not-a-mag')
    with pytest.raises(ValueError):
        service.matrix(data, feature_ids='K99999')
    assert service.matrix(data, query='no match')['features'] == []


def test_zero_vectors_do_not_enter_binary_distance():
    order, _ = service._order(np.array([[0, 0], [1, 0], [0, 1]]), True)
    assert order[-1] == 0
    assert set(order) == {0, 1, 2}


def test_http_contracts_and_csv_use_the_same_pinned_values(data):
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.dataset] = lambda: data
    with TestClient(app) as client:
        response = client.get('/api/mag/functions/matrix', params={'featureIds': 'K00929,K01580', 'magIds': 'M1,M2'})
        assert response.status_code == 200
        assert response.json()['values'] == [[2, 0], [0, 1]]
        assert response.json()['annotationRevision'] == 'tiny-annotation'
        response = client.get('/api/mag/functions/carriers', params={'featureId': 'K00929'})
        assert response.status_code == 200 and response.json()['total'] == 1
        response = client.get('/api/mag/functions/genes', params={'magId': 'M1', 'featureId': 'K00929', 'namespace': 'kofam_ko'})
        assert response.status_code == 200 and response.json()['total'] == 2
        response = client.get('/api/mag/functions/download/matrix', params={'featureIds': 'K00929,K01580', 'magIds': 'M1,M2'})
        assert response.status_code == 200
        assert 'M1,2,0' in response.text and 'M2,0,1' in response.text
        assert client.get('/api/mag/functions/matrix', params={'magIds': 'unknown'}).status_code == 422
        assert client.get('/api/mag/functions/download/matrix', params={'magIds': 'unknown'}).status_code == 422
