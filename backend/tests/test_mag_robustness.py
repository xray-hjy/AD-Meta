from dataclasses import replace

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import mag as api
from app.cli import mag_robustness as cli
from app.domain.mag import MagDataset
from app.services import mag_robustness_store as store
from app.services.mag_robustness_fit import METHODS, fit_cohort

PROTOCOL = {
    'projectAccession': 'EXAMPLE',
    'processingBatch': {'sourceColumn': 'SequencingRun', 'definition': 'Technical processing batch'},
    'observationUnitNote': 'Independent synthetic samples',
}


@pytest.fixture
def cohort(tmp_path):
    samples, values = [], []
    for batch in range(3):
        for i in range(12):
            ad = i < 4 + batch * 2
            age = 60 + (i * 7 + batch * 3) % 15
            male = bool((i + batch) % 2)
            noise = ((i * 13 + batch * 7) % 17 - 8) / 31
            samples.append({'sampleId': f's{batch}-{i}', 'disease': 'AD' if ad else 'NC',
                            'age': age, 'gender': 'M' if male else 'F', 'batch': str(batch + 1)})
            first = 2 ** (-8 + 0.75 * ad + 0.026 * (age - 68) + 0.01 * male + 0.26 * batch + noise)
            second = 2 ** (-9 - 0.18 * ad + 0.08 * batch + noise)
            values.append([first, second, 0.25, first, second])
    matrix = np.array(values)
    matrix[0, 3], matrix[1, 4] = 0, np.nan
    return MagDataset(tmp_path, 'study', tuple(row['sampleId'] for row in samples),
                      ('a', 'b', 'constant', 'zero', 'missing'), matrix, tuple(samples), (100,) * 5,
                      'a' * 64, (), 0)


def test_same_samples_distinct_fdr_and_batch_omissions(cohort):
    summary, qc, rows, omissions = fit_cohort(cohort, PROTOCOL, {})
    assert (summary.sampleCount, summary.adCount, summary.ncCount) == (36, 18, 18)
    assert summary.covariates == ['age', 'gender', 'batch']
    assert summary.batchSourceColumn == 'SequencingRun'
    assert summary.testedUnadjusted == summary.testedAdjusted == 2
    assert qc['design']['adjusted']['rank'] == 6
    a, b, constant, zero, missing = rows
    is_ad = np.array([row['disease'] == 'AD' for row in cohort.samples])
    log_values = np.log2(cohort.matrix[:, 0])
    assert a.unadjusted.beta == pytest.approx(log_values[is_ad].mean() - log_values[~is_ad].mean())
    assert a.adjusted.beta == pytest.approx(0.75, abs=.12)
    assert a.adjusted.geometricMeanRatio == pytest.approx(2 ** a.adjusted.beta)
    assert a.adjusted.qValue == pytest.approx(min(2 * a.adjusted.pValue, b.adjusted.pValue))
    assert a.unadjusted.qValue == pytest.approx(min(2 * a.unadjusted.pValue, b.unadjusted.pValue))
    assert a.adjusted.qValue != a.unadjusted.qValue
    assert constant.adjusted.reason and zero.unadjusted.reason and missing.adjusted.reason
    assert zero.nonPositiveCount == missing.nonFiniteCount == 1
    a_omissions = [row for row in omissions if row.magId == 'a']
    assert [(row.excludedBatch, row.adCount, row.ncCount) for row in a_omissions] == [('1', 14, 10), ('2', 12, 12), ('3', 10, 14)]
    assert all(row.estimate.status == 'estimated' and row.estimate.qValue is None for row in a_omissions)
    for row in a_omissions:
        assert row.betaChange == pytest.approx(row.estimate.beta - a.adjusted.beta)
    assert all(row.estimate.status == 'unavailable' for row in omissions if row.magId in {'zero', 'missing'})


@pytest.mark.parametrize('scenario, explanation', [
    ('unconfirmed', '没有经过确认'), ('missing', '字段有缺失'), ('single', '不足两个'), ('confounded', '混杂'),
])
def test_invalid_batch_preserves_eligible_age_and_sex(cohort, scenario, explanation):
    protocol = {**PROTOCOL}
    if scenario == 'unconfirmed':
        protocol.pop('processingBatch')
    else:
        def batch_value(index, row):
            if scenario == 'missing':
                return '' if index == 0 else row['batch']
            return 'only' if scenario == 'single' else row['disease']

        cohort = replace(cohort, samples=tuple({**row, 'batch': batch_value(i, row)} for i, row in enumerate(cohort.samples)))
    summary, _, rows, omissions = fit_cohort(cohort, protocol, {})
    assert summary.covariates == ['age', 'gender']
    assert any(explanation in note for note in summary.covariateNotes)
    assert rows[0].adjusted.status == 'estimated'
    assert summary.omittedBatches == omissions == []


def test_profile_maps_only_the_confirmed_source_column(cohort, tmp_path, monkeypatch):
    raw = tmp_path / 'raw'
    raw.mkdir()
    source = raw / 'metadata.csv'
    source.write_text('sample_id,SequencingRun,Group\n' + ''.join(
        f"{row['sampleId']},{row['batch']},source\n" for row in cohort.samples), encoding='utf-8')
    monkeypatch.setattr(cli, 'BACKEND_ROOT', tmp_path)
    monkeypatch.setattr(cli, 'RAW_ROOT', raw)
    original = replace(cohort, samples=tuple({**row, 'batch': ''} for row in cohort.samples),
                       cohort_info={'projectAccession': 'EXAMPLE'})
    source_binding = {'file': 'raw/metadata.csv', 'sha256': store.sha256(source)}
    inputs = {'samples': {'files': [source_binding]}}
    profile = {**PROTOCOL, 'datasetKey': cohort.version, 'release': cohort.fingerprint,
               'processingBatch': {**PROTOCOL['processingBatch'], 'sourceFile': source_binding['file'],
                                   'sourceSha256': source_binding['sha256'], 'canonicalField': 'batch',
                                   'definitionSource': 'fixture'}}
    cli.validate_protocol(original, profile, inputs)
    fitted = cli.bind_processing_batch(original, profile, inputs)
    assert fitted.samples == cohort.samples
    assert all(row['batch'] == '' for row in original.samples)
    summary, qc, rows, omissions = fit_cohort(fitted, profile, inputs)
    store.write_bundle(tmp_path, summary, METHODS, qc, rows, omissions)
    assert len(store.read_bundle(tmp_path, original).sensitivity['a']) == 3
    with pytest.raises(ValueError, match='发布记录的 SHA-256 不一致'):
        source.write_text('sample_id,SequencingRun\n', encoding='utf-8')
        cli.bind_processing_batch(original, profile, inputs)


def test_api_and_downloads_are_pinned_to_validated_release(cohort, tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'STORAGE_ROOT', tmp_path / 'storage')
    summary, qc, rows, sensitivity = fit_cohort(cohort, PROTOCOL, {})
    output = tmp_path / 'result'
    output.mkdir()
    store.write_bundle(output, summary, METHODS, qc, rows, sensitivity)
    installed = store.install_bundle(output, cohort)
    assert store.install_bundle(output, cohort) == installed

    newer = replace(cohort, fingerprint='b' * 64)
    releases = {data.fingerprint: data for data in (cohort, newer)}
    monkeypatch.setattr(api.service, 'load_mag_dataset', lambda _, release: releases[release])
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        matching = {'revision': cohort.fingerprint}
        root = '/api/mag/robustness'
        result = client.get(root, params={**matching, 'disease': 'AD', 'batch': '2'}).json()
        assert result['summary']['sampleCount'] == 36
        assert result['items'][0]['beta'] == rows[0].adjusted.beta
        detail = client.get(root, params={**matching, 'magId': 'a'}).json()
        assert detail['association'] == rows[0].model_dump()
        assert detail['sensitivity'] == [row.model_dump() for row in sensitivity if row.magId == 'a']
        for kind, name in store.DOWNLOADS.items():
            download = client.get(f'{root}/download/{kind}', params=matching)
            assert download.headers['X-Data-Fingerprint'] == cohort.fingerprint
            assert download.content == (output / name).read_bytes()
        assert client.get(root, params={**matching, 'magId': 'old-mag'}).status_code == 404
        different = {'revision': newer.fingerprint}
        assert client.get(root, params=different).json()['status'] == 'unavailable'
        assert client.get(f'{root}/download/associations', params=different).status_code == 404
        (installed / store.MAIN).write_bytes(b'corrupt')
        assert client.get(root, params=matching).json()['status'] == 'unavailable'
        assert client.get(f'{root}/download/associations', params=matching).status_code == 404
