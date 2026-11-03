"""Small independent scientific checks; no full cohort/browser regression suite."""
import sqlite3
from dataclasses import replace
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


def test_large_body_queries_preserve_matrix_order_download_values_and_validation(data):
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.dataset] = lambda: data
    ids = ','.join(['M2', 'M1'] * 500)
    with TestClient(app) as client:
        response = client.post('/api/mag/functions/query/matrix', json={'magIds': ids, 'featureIds': 'K01580,K00929'})
        assert response.status_code == 200
        assert [r['magId'] for r in response.json()['mags']] == ['M2', 'M1']
        assert response.json()['values'] == [[1, 0], [0, 2]]
        csv = client.post('/api/mag/functions/query/download/matrix', json={'magIds': ids, 'featureIds': 'K00929'})
        assert csv.status_code == 200 and 'M1,2' in csv.text and 'M2,0' in csv.text
        assert client.post('/api/mag/functions/query/matrix', json={'magIds': 'unknown'}).status_code == 422
        assert client.post('/api/mag/functions/query/matrix', json={'magIds': 'M1', 'foreign': 1}).status_code == 422
        assert client.post('/api/mag/functions/query/matrix?magLimit=0', json={'magIds': 'M1'}).status_code == 422
        assert client.post('/api/mag/functions/query/matrix', json={'magIds': 'x' * 150001}).status_code == 422
        distributions = client.post('/api/mag/functions/query/distributions', json={'magIds': 'M2,M1'})
        assert distributions.status_code == 200 and distributions.json()['limit'] == 6


def test_complete_cohort_times_thirty_features_fits_the_display_budget(data, monkeypatch):
    # Only catalog size is synthetic; existing nonzero cells still come from the independent SQLite fixture.
    mags = [{'magId': f'M{i}'} for i in range(1, 873)]
    features = [{'featureId': 'K00929'}, *[{'featureId': f'K{i:05}'} for i in range(29)]]
    monkeypatch.setattr(service, '_mags', lambda *a, **kw: mags)
    monkeypatch.setattr(service, 'feature_rows', lambda *a, **kw: features)
    result = service.matrix(data, mag_limit=872, feature_limit=30)
    assert len(result['values']) == 872 and len(result['values'][0]) == 30
    assert result['values'][0][0] == 2
    monkeypatch.setattr(service, 'feature_rows', lambda *a, **kw: [{'featureId': f'K{i:05}'} for i in range(200)])
    with pytest.raises(ValueError, match='100,000'):
        service.matrix(data, mag_limit=872, feature_limit=200)


def test_bgc_selection_preserves_manual_order_and_missing_results(data, monkeypatch):
    selected = replace(data, modules={**data.modules, 'bgc': {'revision': 'bgc', 'status': 'partial'}})
    monkeypatch.setattr(service, '_source_rows', lambda revision, kind:
                        [{'magId': 'M1', 'products': ['NRPS']}] if kind == 'bgc_regions' else
                        [{'magId': 'M1', 'status': 'success'}, {'magId': 'M2', 'status': 'not_provided'}])
    result = service.source_matrix(selected, 'bgc', mag_ids='M2,M1', mag_limit=2)
    assert [r['magId'] for r in result['mags']] == ['M2', 'M1']
    assert result['values'] == [[None], [1]]
    assert service.source_matrix(selected, 'bgc', mag_ids='M2', mag_limit=1)['selection']['shownMags'] == 1


@pytest.fixture
def functional_client(data, monkeypatch):
    modules = {**data.modules, 'arg': {'revision': 'arg', 'status': 'ready'},
               'bgc': {'revision': 'bgc', 'status': 'partial'}}
    selected = replace(data, modules=modules)
    records = {
        'arg_hits': [{'magId': 'M1', 'category': 'known_hmm_hit', 'queryName': 'ARG fixture', 'passes': {}},
                     {'magId': 'M2', 'category': 'novel_candidate', 'queryName': 'Novel fixture', 'passes': {'passed_0.95': True}}],
        'arg_summary': [{'magId': 'M1', 'status': 'success'}, {'magId': 'M2', 'status': 'success'}],
        'bgc_regions': [{'magId': 'M1', 'products': ['NRPS']}],
        'bgc_status': [{'magId': 'M1', 'status': 'success'}, {'magId': 'M2', 'status': 'not_provided'}],
    }
    monkeypatch.setattr(service, '_source_rows', lambda revision, kind: records[kind])
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.dataset] = lambda: selected
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize('resource', [
    'features', 'compare', 'distributions', 'themes/butyrate', 'themes/bile', 'themes/cofactor',
    'sources/arg/matrix', 'sources/bgc/matrix',
])
def test_body_and_query_projections_have_identical_scope_and_values(functional_client, resource):
    ids = {'magIds': 'M2,M1', 'featureIds': 'K00929'}
    params = {'magLimit': 2, 'featureLimit': 2}
    get_ids = {**ids}
    if resource == 'features':
        get_ids['ids'] = get_ids.pop('featureIds')
    expected = functional_client.get('/api/mag/functions/' + resource, params={**params, **get_ids})
    actual = functional_client.post('/api/mag/functions/query/' + resource, params=params, json=ids)
    assert actual.status_code == expected.status_code == 200
    # GET response contracts add optional null fields; the scientific payload and
    # fixed release/selection fingerprints must be the same through either route.
    actual_payload = actual.json()
    if resource.startswith(('sources/', 'themes/')):
        actual_payload = api.FunctionalMatrix.model_validate(actual_payload).model_dump()
    assert {k: v for k, v in actual_payload.items() if v is not None} == {
        k: v for k, v in expected.json().items() if v is not None}
    assert actual.json()['annotationRevision'] == 'tiny-annotation'


@pytest.mark.parametrize('kind', [
    'features', 'matrix', 'carriers', 'genes', 'arg', 'bgc', 'signals', 'provenance', 'distributions',
])
def test_body_downloads_match_query_exports_and_keep_all_selected_rows(functional_client, kind):
    ids = {'magIds': 'M2,M1', 'featureIds': 'K00929'}
    params = {'magId': 'M1', 'featureId': 'K00929', 'allMatches': 'true', 'valueKind': 'count'}
    expected = functional_client.get('/api/mag/functions/download/' + kind, params={**params, **ids})
    actual = functional_client.post('/api/mag/functions/query/download/' + kind, params=params, json=ids)
    assert actual.status_code == expected.status_code == 200
    assert actual.content == expected.content
    if kind == 'matrix':
        assert 'M2,0' in actual.text and 'M1,2' in actual.text
    if kind == 'distributions':
        assert len(actual.text.splitlines()) == 9  # 2 MAGs x 4 actual samples + header.


def test_body_router_rejects_unknown_resources_and_excess_distribution_pages(functional_client):
    for resource in ['unlisted', 'download/unlisted']:
        response = functional_client.post('/api/mag/functions/query/' + resource, json={'magIds': 'M1'})
        assert response.status_code == 404
    response = functional_client.post('/api/mag/functions/query/distributions?limit=13', json={'magIds': 'M1'})
    assert response.status_code == 422
    response = functional_client.post('/api/mag/functions/query/matrix?magIds=M1&featureIds=K00929',
                                      params={'valueKind': 'count'}, json={'magIds': 'M2', 'featureIds': 'K01580'})
    assert response.status_code == 200
    assert [row['magId'] for row in response.json()['mags']] == ['M2']
    assert response.json()['values'] == [[1]]
