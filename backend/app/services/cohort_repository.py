"""Persist source artifacts and atomically publish immutable cohort releases."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache

import numpy as np

from app.core.config import BACKEND_ROOT
from app.core.database import connect, utcnow
from app.domain.mag import MagDataError, MagDataset


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


def decode(value):
    return json.loads(value) if isinstance(value, str) else value


KEYS = {'samples': 'sampleId', 'representatives': 'magId', 'quality': 'magId', 'taxonomy': 'magId',
        'lineage': 'memberMag', 'arg_summary': 'magId', 'arg_hits': 'id', 'bgc_regions': 'id',
        'bgc_status': 'magId', 'trees': 'id', 'coverage_metrics': 'id', 'archived_files': 'id'}


def record_rows(artifact, kind, values):
    for row in values:
        yield (artifact, kind, row[KEYS[kind]], encode(row))


def save_import(config, modules, community):
    cohort = config['key']
    bindings = {name: value['revision'] for name, value in modules.items()}
    release = fingerprint({'cohort': cohort, 'modules': bindings, 'community': community})
    with connect() as conn:
        existing = conn.execute('SELECT cohort_key FROM cohorts WHERE cohort_key = ?', (cohort,)).fetchone()
        if not existing:
            conn.execute('INSERT INTO cohorts (cohort_key,name,project_accession,study_accession,created_at) VALUES (?,?,?,?,?)',
                         (cohort, config['name'], config['projectAccession'], config['studyAccession'], utcnow()))
        else:
            conn.execute('UPDATE cohorts SET name = ? WHERE cohort_key = ?', (config['name'], cohort))
        for name, module in modules.items():
            revision = module['revision']
            if conn.execute('SELECT revision_key FROM cohort_artifact_revisions WHERE revision_key = ?', (revision,)).fetchone():
                continue
            conn.execute('INSERT INTO cohort_artifact_revisions (revision_key,cohort_key,module,parser_version,status,sources_json,report_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
                         (revision, cohort, name, module['parserVersion'], module['status'], encode(module['sources']), encode(module['report']), utcnow()))
            for kind, values in module['records'].items():
                if kind not in KEYS:
                    continue
                batch = []
                for row in record_rows(revision, kind, values):
                    batch.append(row)
                    if len(batch) >= 2000:
                        conn.executemany('INSERT INTO cohort_artifact_records (artifact_revision,record_kind,record_key,payload_json) VALUES (?,?,?,?)', batch)
                        batch = []
                if batch:
                    conn.executemany('INSERT INTO cohort_artifact_records (artifact_revision,record_kind,record_key,payload_json) VALUES (?,?,?,?)', batch)
            if name == 'abundance' and module['status'] == 'ready':
                data = module['records']
                batch = []
                for i, sid in enumerate(data['sample_ids']):
                    for j, mid in enumerate(data['mag_ids']):
                        batch.append((revision, sid, mid, float(data['matrix'][i, j])))
                        if len(batch) >= 5000:
                            conn.executemany('INSERT INTO cohort_mag_abundances (artifact_revision,sample_code,mag_code,abundance_percent) VALUES (?,?,?,?)', batch)
                            batch = []
                if batch:
                    conn.executemany('INSERT INTO cohort_mag_abundances (artifact_revision,sample_code,mag_code,abundance_percent) VALUES (?,?,?,?)', batch)
        if not conn.execute('SELECT release_key FROM cohort_releases WHERE release_key = ?', (release,)).fetchone():
            conn.execute('INSERT INTO cohort_releases (release_key,cohort_key,artifacts_json,community_json,created_at) VALUES (?,?,?,?,?)',
                         (release, cohort, encode(bindings), encode(community), utcnow()))
        # The pointer changes only after every row and pinned community revision is recorded.
        conn.execute('UPDATE cohorts SET current_release = ? WHERE cohort_key = ?', (release, cohort))
    return release


def list_cohorts():
    with connect() as conn:
        rows = conn.execute('SELECT c.*,r.artifacts_json,r.community_json FROM cohorts c JOIN cohort_releases r ON r.release_key = c.current_release ORDER BY c.cohort_key').fetchall()
    return [{'key': r['cohort_key'], 'name': r['name'], 'projectAccession': r['project_accession'],
             'studyAccession': r['study_accession'], 'release': r['current_release'],
             'modules': list(decode(r['artifacts_json'])), 'communityResults': decode(r['community_json'])} for r in rows]


def list_releases(cohort):
    with connect() as conn:
        rows = conn.execute('SELECT r.release_key,r.created_at,r.artifacts_json,r.community_json,c.current_release FROM cohort_releases r JOIN cohorts c ON c.cohort_key=r.cohort_key WHERE r.cohort_key = ? ORDER BY r.created_at DESC,r.release_key', (cohort,)).fetchall()
        revisions = {revision for row in rows for revision in decode(row['artifacts_json']).values()}
        artifacts = {}
        if revisions:
            placeholders = ','.join('?' for _ in revisions)
            artifacts = {row['revision_key']: decode(row['sources_json']) for row in conn.execute(
                f'SELECT revision_key,sources_json FROM cohort_artifact_revisions WHERE revision_key IN ({placeholders})',
                list(revisions),
            ).fetchall()}

    # Parser-code edits and metadata-link enrichment can create new immutable
    # releases without introducing a new source batch. Keep only the newest
    # release for each exact raw-file inventory in the batch selector.
    unique, seen_sources = [], set()
    rows = sorted(rows, key=lambda row: (row['created_at'], row['release_key']), reverse=True)
    rows.sort(key=lambda row: row['release_key'] != row['current_release'])
    for row in rows:
        bindings = decode(row['artifacts_json'])
        inventory = sorted({(source['file'], source['sha256'])
                            for revision in bindings.values()
                            for source in artifacts.get(revision, [])})
        source_key = fingerprint(inventory)
        if source_key in seen_sources:
            continue
        seen_sources.add(source_key)
        unique.append({'key': row['release_key'], 'createdAt': str(row['created_at']), 'modules': bindings,
                       'communityResults': decode(row['community_json'])})
    return unique


def release_record(cohort='', release=''):
    with connect() as conn:
        if release:
            row = conn.execute('SELECT r.*,c.name FROM cohort_releases r JOIN cohorts c ON c.cohort_key=r.cohort_key WHERE r.release_key = ?', (release,)).fetchone()
        else:
            row = conn.execute('SELECT r.*,c.name FROM cohorts c JOIN cohort_releases r ON r.release_key=c.current_release WHERE c.cohort_key = ?', (cohort,)).fetchone()
    if not row or (cohort and row['cohort_key'] != cohort):
        raise MagDataError('cohort release', 'published matching dataset and release', {'cohort': cohort, 'release': release})
    return dict(row)


def records(revision, kind, limit=None, offset=0, mag_id='', query=''):
    # Natural record keys start with MAG ID for protein/region entries.
    clause = 'artifact_revision = ? AND record_kind = ?'
    params = [revision, kind]
    if mag_id:
        clause += ' AND (record_key = ? OR record_key LIKE ? ESCAPE \'!\')'
        escaped = mag_id.replace('!', '!!').replace('%', '!%').replace('_', '!_')
        params.extend([mag_id, escaped + '|%'])
    if query:
        clause += ' AND payload_json LIKE ? ESCAPE \'!\''
        params.append('%' + query.replace('!', '!!').replace('%', '!%').replace('_', '!_') + '%')
    with connect() as conn:
        count = conn.execute('SELECT COUNT(*) AS n FROM cohort_artifact_records WHERE '+clause, params).fetchone()['n']
        sql = 'SELECT payload_json FROM cohort_artifact_records WHERE '+clause+' ORDER BY record_key'
        if limit is not None:
            sql += ' LIMIT ? OFFSET ?'
            params.extend([limit, offset])
        rows = conn.execute(sql, params).fetchall()
    return [decode(row['payload_json']) for row in rows], count


def artifact_info(revision):
    with connect() as conn:
        row = conn.execute('SELECT * FROM cohort_artifact_revisions WHERE revision_key = ?', (revision,)).fetchone()
    if row is None:
        raise MagDataError('artifact', 'existing immutable artifact', revision)
    return {**dict(row), 'sources': decode(row['sources_json']), 'report': decode(row['report_json'])}


@lru_cache(maxsize=4)
def load_release(release):
    entry = release_record(release=release)
    bindings = decode(entry['artifacts_json'])
    modules = {name: artifact_info(revision) for name, revision in bindings.items()}
    abundance = modules.get('abundance', {})
    if abundance.get('status') != 'ready':
        raise MagDataError('abundance', 'ready abundance artifact', abundance.get('status'))
    samples = records(bindings['abundance'], 'samples')[0]
    representatives = records(bindings['abundance'], 'representatives')[0]
    sample_ids = tuple(row['sampleId'] for row in samples)
    mag_ids = tuple(row['magId'] for row in representatives)
    si, mi = {v: i for i, v in enumerate(sample_ids)}, {v: i for i, v in enumerate(mag_ids)}
    matrix = np.zeros((len(samples), len(representatives)), dtype=float)
    with connect() as conn:
        values = conn.execute('SELECT sample_code,mag_code,abundance_percent FROM cohort_mag_abundances WHERE artifact_revision = ?', (bindings['abundance'],)).fetchall()
    if len(values) != matrix.size:
        raise MagDataError('abundance', f'{matrix.size} cells', len(values))
    for row in values:
        matrix[si[row['sample_code']], mi[row['mag_code']]] = row['abundance_percent']
    matrix.setflags(write=False)

    def get(name, kind):
        if modules.get(name, {}).get('status') not in {'ready', 'partial'}:
            return ()
        return tuple(records(bindings[name], kind)[0])

    report = {name: {'revision': m['revision_key'], 'status': m['status'], **m['report']} for name, m in modules.items()}
    # Per-artifact inventories avoid repeating thousands of GBK/JS names in every chart response.
    sources = tuple({'file': 'artifact:'+m['module'], 'sha256': fingerprint(m['sources']),
                     'bytes': sum(s['bytes'] for s in m['sources'])} for m in modules.values())
    tools = {name: m['report'].get('tool', {}) for name, m in modules.items()}
    annotation = {'tools': tools, 'status': 'published', 'buildDate': str(entry['created_at'])}
    quality = tuple(row for row in get('quality', 'quality') if row['magId'] in mi)
    return MagDataset(root=BACKEND_ROOT / 'storage', version=entry['cohort_key'], sample_ids=sample_ids,
                      mag_ids=mag_ids, matrix=matrix, samples=tuple(samples), lengths=tuple(r['lengthBp'] for r in representatives),
                      fingerprint=release, sources=sources, max_mapping_error=abundance['report']['maxMappingError'],
                      taxonomy=get('taxonomy', 'taxonomy'), quality=quality, lineage=get('lineage', 'lineage'),
                      annotation_manifest=annotation, modules=report,
                      community_results=decode(entry['community_json']),
                      processing={'assessedBins': report.get('quality', {}).get('assessedBins'),
                                  'qualifiedBins': report.get('lineage', {}).get('qualifiedBins'),
                                  'representativeMags': len(mag_ids), 'sampleCount': len(samples),
                                  'referenceBandCount': sum(r['inReferenceBand'] for r in quality)})
