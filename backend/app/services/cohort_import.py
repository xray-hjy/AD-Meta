"""Explicit, repeatable import of raw source modules; publish only completed transactions."""
from __future__ import annotations

import hashlib
import inspect
import json
import uuid
from pathlib import Path

from app.core.config import BACKEND_ROOT, RAW_ROOT, STORAGE_ROOT
from app.core.database import connect, utcnow
from app.core.storage_paths import DEFAULT_MANIFEST
from app.domain.mag import MagDataError
from app.services.cohort_repository import encode, fingerprint, save_import
from app.services.mag_source_adapters import ADAPTERS, PARSER_VERSION


def sha256(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            value.update(chunk)
    return value.hexdigest()


def resolve(value):
    candidate = (BACKEND_ROOT / value).resolve()
    if not candidate.is_relative_to(RAW_ROOT.resolve()):
        raise ValueError(f'Source must be under raw: {value}')
    return candidate


def resolve_files(spec):
    files = {}
    for name, value in spec.get('files', {}).items():
        path = resolve(value)
        if not path.is_file():
            raise FileNotFoundError(f'Missing raw source: {value}')
        files[name] = path
    if spec.get('globRoot'):
        root = resolve(spec['globRoot'])
        if not root.is_dir():
            raise FileNotFoundError(f'Missing raw directory: {root}')
        for pattern in spec.get('patterns', []):
            for path in sorted(root.glob(pattern)):
                if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root):
                    raise ValueError(f'Invalid source: {path}')
                files[path.relative_to(root).as_posix()] = path
    if not files:
        raise FileNotFoundError('No declared source files are available')
    return files


def sources_for(files):
    unique = {path.resolve() for path in files.values()}
    return [{'file': path.relative_to(BACKEND_ROOT).as_posix(), 'sha256': sha256(path), 'bytes': path.stat().st_size}
            for path in sorted(unique)]


def import_cohort(key, manifest_path=DEFAULT_MANIFEST, *, publish=True):
    manifest = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    configurations = {entry['key']: entry for entry in manifest.get('cohorts', [])}
    if key not in configurations:
        raise ValueError(f'Unknown cohort: {key}')
    config = configurations[key]
    job, started = uuid.uuid4().hex, utcnow()
    with connect() as conn:
        conn.execute('INSERT INTO cohort_import_jobs (job_key,cohort_key,status,report_json,started_at) VALUES (?,?,?,?,?)',
                     (job, key, 'running', '{}', started))
    modules, parsed, report = {}, {}, {}
    source_signatures = {}
    try:
        pending = dict(config['modules'])
        while pending:
            progressed = False
            for name, spec in list(pending.items()):
                parser, dependencies = ADAPTERS[spec['parser']]
                if any(d in pending for d in dependencies):
                    continue
                progressed = True
                files, source_list, data, status = {}, [], {}, 'ready'
                dependencies_ids = {dep: modules.get(dep, {}).get('revision') for dep in dependencies}
                try:
                    if any(dep not in parsed for dep in dependencies):
                        raise ValueError(f'Unavailable dependencies: {dependencies}')
                    files = resolve_files(spec)
                    signatures = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in files.values()}
                    source_signatures.update(signatures)
                    source_list = sources_for(files)
                    data, module_report = parser(files, parsed, spec)
                    for path, signature in signatures.items():
                        if (path.stat().st_size, path.stat().st_mtime_ns) != signature:
                            raise ValueError(f'Source changed during import: {path}')
                    status = module_report.get('status', 'ready')
                    parsed[name] = data
                except (OSError, ValueError, KeyError, TypeError, IndexError, StopIteration) as exc:
                    module_report = {'error': str(exc), 'errorType': type(exc).__name__}
                    status = 'not_provided' if isinstance(exc, FileNotFoundError) else 'invalid'
                    if spec.get('required', False):
                        raise MagDataError(name, 'valid required source artifact', str(exc)) from exc
                module_report['tool'] = {**spec.get('tool', {}), **module_report.get('tool', {})}
                parser_hash = sha256(Path(inspect.getfile(parser)))
                module_report['parserSha256'] = parser_hash
                identity = {'cohort': key, 'module': name, 'parserVersion': PARSER_VERSION,
                            'parserSha256': parser_hash, 'recordSchema': 1,
                            'spec': spec, 'sources': source_list, 'dependencies': dependencies_ids, 'status': status}
                revision = fingerprint(identity)
                modules[name] = {'revision': revision, 'parserVersion': PARSER_VERSION, 'status': status,
                                 'sources': source_list, 'report': module_report, 'records': data}
                report[name] = {'status': status, 'revision': revision, **module_report}
                print(f'{name}: {status}', flush=True)
                del pending[name]
            if not progressed:
                raise ValueError(f'Cyclic or missing module dependencies: {list(pending)}')
        community = {}
        with connect() as conn:
            for name, slug in config.get('communityDatasets', {}).items():
                row = conn.execute('SELECT d.id AS dataset_id,d.slug,r.id AS revision_id,r.revision_key FROM datasets d JOIN dataset_revisions r ON r.id=d.current_revision_id WHERE d.slug = ? AND d.status = ? AND r.status = ?',
                                   (slug, 'published', 'published')).fetchone()
                community[name] = {'datasetSlug': slug, 'revision': row['revision_key'] if row else None}
                if row:
                    sample_rows = conn.execute('SELECT sample_code,phenotype FROM revision_sample_info WHERE revision_id = ?', (row['revision_id'],)).fetchall()
                    expected = {r['sampleId']: r['disease'] for r in parsed['samples']['samples']}
                    actual = {r['sample_code']: r['phenotype'] for r in sample_rows}
                    if actual != expected:
                        raise ValueError(f'Community result {slug} does not match the cohort sample IDs and labels')
                    link = conn.execute('SELECT ar.run_key,aa.artifact_key FROM analysis_artifacts aa JOIN analysis_runs ar ON ar.id=aa.analysis_run_id WHERE aa.dataset_id = ? AND aa.dataset_revision_id = ? AND ar.status = ? ORDER BY ar.published_at DESC LIMIT 1',
                                        (row['dataset_id'], row['revision_id'], 'published')).fetchone()
                    if link:
                        community[name].update(runKey=link['run_key'], artifactKey=link['artifact_key'])
        for path, signature in source_signatures.items():
            if (path.stat().st_size, path.stat().st_mtime_ns) != signature:
                raise ValueError(f'Source changed before publication: {path}')
        release = save_import(config, modules, community) if publish else None
        result = {'cohort': key, 'release': release, 'job': job, 'modules': report, 'community': community}
        report_dir = STORAGE_ROOT / 'provenance' / 'cohorts' / key
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / (job+'.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        with connect() as conn:
            conn.execute('UPDATE cohort_import_jobs SET status = ?,release_key = ?,report_json = ?,finished_at = ? WHERE job_key = ?',
                         ('published' if publish else 'validated', release, encode(result), utcnow(), job))
        return result
    except Exception as exc:
        with connect() as conn:
            conn.execute('UPDATE cohort_import_jobs SET status = ?,report_json = ?,finished_at = ? WHERE job_key = ?',
                         ('failed', encode({'modules': report, 'error': str(exc)}), utcnow(), job))
        raise
