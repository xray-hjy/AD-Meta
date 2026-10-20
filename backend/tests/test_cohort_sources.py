"""Publication and provenance regressions for the independent raw-source pipeline."""
import json

import pytest

from app.core import database
from app.core.migrations import upgrade_database
from app.domain.mag import MagDataError, MagScope
from app.services import cohort_import as importer
from app.services import cohort_repository as repository
from app.services.mag_analysis_service import load_mag_dataset, overview
from app.services.mag_source_adapters import parse_bgc, parse_trees


@pytest.fixture
def source_cohort(tmp_path, monkeypatch):
    database.dispose_engine()
    monkeypatch.setattr(database, 'DB_ENGINE', 'sqlite')
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'test.sqlite3')
    upgrade_database()
    monkeypatch.setattr(importer, 'BACKEND_ROOT', tmp_path)
    monkeypatch.setattr(importer, 'RAW_ROOT', tmp_path / 'raw')
    monkeypatch.setattr(importer, 'STORAGE_ROOT', tmp_path / 'storage')
    raw = tmp_path / 'raw'
    raw.mkdir()
    (raw/'labels.tsv').write_text('sample_id\tGroup\nCRR1\tAD\nCRR2\tNC\n', encoding='utf-8')
    # Input order deliberately differs from the shared sample index.
    (raw/'matrix.tsv').write_text('Sample\tCRR1__bin\nCRR2\t7\nCRR1\t4\n', encoding='utf-8')
    (raw/'lengths.tsv').write_text('MAG\tlength_bp\nCRR1__bin\t1000\n', encoding='utf-8')
    (raw/'manifest.tsv').write_text('Sample\tR1\tR2\tCoverMLabel\nCRR2\tx\ty\t2\nCRR1\tx\ty\t1\n', encoding='utf-8')
    (raw/'mapping.tsv').write_text('Sample\tMapped\tUnmapped\nCRR2\t7\t93\nCRR1\t4\t96\n', encoding='utf-8')
    config = {'key': 'cohort-a', 'name': 'A', 'projectAccession': 'PROJECT', 'studyAccession': 'STUDY',
              'modules': {'samples': {'parser': 'samples', 'required': True, 'files': {'labels': 'raw/labels.tsv'}},
                          'abundance': {'parser': 'coverm', 'required': True, 'mappedColumn': 'Mapped', 'unmappedColumn': 'Unmapped',
                                        'files': {k: 'raw/'+v+'.tsv' for k, v in {'matrix': 'matrix', 'lengths': 'lengths', 'manifest': 'manifest', 'mapping': 'mapping'}.items()}},
                          'taxonomy': {'parser': 'gtdbtk', 'files': {'bacteria': 'raw/missing.tsv'}}}}
    manifest = tmp_path/'manifest.json'
    manifest.write_text(json.dumps({'cohorts': [config]}), encoding='utf-8')
    repository.load_release.cache_clear()
    yield raw, manifest, config
    repository.load_release.cache_clear()
    database.dispose_engine()


def test_import_is_idempotent_and_runtime_survives_unmounted_raw(source_cohort):
    raw, manifest, _ = source_cohort
    first = importer.import_cohort('cohort-a', manifest)
    again = importer.import_cohort('cohort-a', manifest)
    assert first['release'] == again['release']
    assert len(repository.list_releases('cohort-a')) == 1
    data = load_mag_dataset('cohort-a')
    assert data.matrix.tolist() == [[4], [7]]
    assert data.samples[0]['disease'] == 'AD'
    assert data.samples[0]['age'] is None
    assert overview(data, MagScope())['options']['ageMin'] is None
    assert data.modules['taxonomy']['status'] == 'not_provided'
    raw.rename(raw.with_name('unmounted'))
    repository.load_release.cache_clear()
    assert load_mag_dataset('cohort-a').matrix.tolist() == [[4], [7]]
    # No delivery package directory or fixed cohort dimensions were needed.
    assert not (manifest.parent/'ADMetaData').exists()


def test_failed_required_import_preserves_published_release(source_cohort):
    raw, manifest, _ = source_cohort
    published = importer.import_cohort('cohort-a', manifest)['release']
    (raw/'matrix.tsv').write_text('Sample\tCRR1__bin\nCRR2\t7\nCRR1\t99\n', encoding='utf-8')
    with pytest.raises(MagDataError):
        importer.import_cohort('cohort-a', manifest)
    assert repository.release_record('cohort-a')['release_key'] == published
    with database.connect() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM cohort_import_jobs WHERE status='failed'").fetchone()['n'] == 1


def test_release_pins_metadata_and_rejects_wrong_cohort(source_cohort):
    raw, manifest, config = source_cohort
    first = importer.import_cohort('cohort-a', manifest)['release']
    (raw/'metadata.csv').write_text('sample_id,disease,Age,Gender,HPC_Batch\nCRR1,AD,81,M,A\nCRR2,NC,72,F,B\n', encoding='utf-8')
    config['modules']['samples']['files']['metadata'] = 'raw/metadata.csv'
    manifest.write_text(json.dumps({'cohorts': [config]}), encoding='utf-8')
    second = importer.import_cohort('cohort-a', manifest)['release']
    assert first != second
    assert load_mag_dataset('cohort-a', first).samples[0]['age'] is None
    assert load_mag_dataset('cohort-a', second).samples[0]['age'] == 81
    with pytest.raises(MagDataError):
        load_mag_dataset('another-cohort', second)


def test_invalid_optional_artifact_does_not_disable_abundance(source_cohort):
    raw, manifest, config = source_cohort
    (raw/'bad.tsv').write_text('wrong\theader\n1\t2\n', encoding='utf-8')
    config['modules']['taxonomy']['files'] = {'bacteria': 'raw/bad.tsv', 'archaea': 'raw/bad.tsv'}
    manifest.write_text(json.dumps({'cohorts': [config]}), encoding='utf-8')
    result = importer.import_cohort('cohort-a', manifest)
    assert result['modules']['taxonomy']['status'] == 'invalid'
    assert overview(load_mag_dataset('cohort-a'), MagScope())['capabilities']['taxonomy'] is False


def test_bgc_zero_is_different_from_absent_results(tmp_path):
    path = tmp_path/'MAG_A'/'regions.js'
    path.parent.mkdir()
    path.write_text('var recordData = [{"seq_id":"c1","regions":[]}];\n', encoding='utf-8')
    parsed, report = parse_bgc({'result': path}, {'abundance': {'mag_ids': ['MAG_A', 'MAG_B']}}, {})
    states = {r['magId']: r for r in parsed['bgc_status']}
    assert states['MAG_A']['status'] == 'success' and states['MAG_A']['regionCount'] == 0
    assert states['MAG_B']['status'] == 'not_provided' and states['MAG_B']['regionCount'] is None
    assert report['status'] == 'partial'


def test_tree_cannot_silently_introduce_foreign_mags(tmp_path):
    path = tmp_path/'treefile'
    path.write_text('(MAG_A:0.1,FOREIGN:0.2);', encoding='utf-8')
    with pytest.raises(MagDataError):
        parse_trees({'tree': path}, {'abundance': {'mag_ids': ['MAG_A']}}, {})
