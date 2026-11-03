#!/usr/bin/env python3
"""Create a source/data/MySQL deployment handoff without changing the live DB.

Run with backend/.venv/bin/python. Export may need local database access outside
the desktop sandbox. Keep the output private: the database contains research data.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


def sha256(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + '\n')


def quote_option(value):
    value = str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r')
    return '"' + value + '"'


def source_state():
    from app.core.database import connect
    with connect() as connection:
        tables = connection.execute("SELECT table_name AS name,engine AS storage_engine,table_collation AS collation_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name").fetchall()
        counts = {row['name']: int(connection.execute(f"SELECT COUNT(*) AS n FROM `{row['name']}`").fetchone()['n']) for row in tables}
        datasets = [dict(r) for r in connection.execute('SELECT slug,current_revision_id FROM datasets ORDER BY slug').fetchall()]
        cohorts = [dict(r) for r in connection.execute('SELECT cohort_key,current_release FROM cohorts ORDER BY cohort_key').fetchall()]
        caches = [dict(r) for r in connection.execute('''SELECT a.cache_path,a.sha256,a.size_bytes,
                     a.revision_id,d.current_revision_id,d.slug FROM revision_chart_artifacts a
                     JOIN dataset_revisions r ON r.id=a.revision_id JOIN datasets d ON d.id=r.dataset_id
                     ORDER BY a.id''').fetchall()]
        version = connection.execute('SELECT VERSION() AS version').fetchone()['version']
        revision = connection.execute('SELECT version_num AS version FROM alembic_version').fetchone()['version']
        for kind, query in (
            ('views', 'SELECT COUNT(*) AS n FROM information_schema.views WHERE table_schema=DATABASE()'),
            ('routines', 'SELECT COUNT(*) AS n FROM information_schema.routines WHERE routine_schema=DATABASE()'),
            ('triggers', 'SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema=DATABASE()'),
            ('events', 'SELECT COUNT(*) AS n FROM information_schema.events WHERE event_schema=DATABASE()'),
        ):
            if connection.execute(query).fetchone()['n']:
                raise RuntimeError('Unexpected ' + kind + '; explicitly extend backup before packaging.')
    if any(row['storage_engine'] != 'InnoDB' for row in tables):
        raise RuntimeError('Nontransactional table found; a transactional dump alone is insufficient.')
    derived = []
    for path in sorted((ROOT / 'backend/storage/derived/mag-functions').glob('*.sqlite')):
        checksum = sha256(path)
        if checksum != path.stem:
            raise RuntimeError('Immutable functional index filename/hash mismatch: ' + path.name)
        with sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True) as database:
            if database.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise RuntimeError('Invalid functional SQLite index.')
            row_counts = {table: database.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                          for table in ('mags', 'features', 'counts', 'genes', 'hits', 'distill')}
        derived.append({'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size,
                        'sha256': checksum, 'row_counts': row_counts})
    historical_gaps = []
    for entry in caches:
        path = Path(entry['cache_path'])
        if path.is_absolute() or '..' in path.parts:
            raise RuntimeError('Nonportable cache path requires an explicit copy-only migration: ' + str(path))
        actual = ROOT / 'backend' / path
        if not actual.is_file() or sha256(actual) != entry['sha256']:
            if entry['revision_id'] == entry['current_revision_id']:
                raise RuntimeError('A current published chart artifact is missing/changed: ' + str(path))
            historical_gaps.append({'path': str(path), 'expected_sha256': entry['sha256'],
                                    'status': 'missing_in_source' if not actual.is_file() else 'changed_in_source'})
    return {'server_version': version, 'alembic_revision': revision, 'table_counts': counts,
            'table_definitions': [dict(r) for r in tables], 'datasets': datasets, 'cohorts': cohorts,
            'chart_artifacts': caches, 'derived_files': derived, 'historical_chart_gaps': historical_gaps,
            'captured_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()}


def export_database(output):
    from app.core.config import SETTINGS
    if SETTINGS.db_engine != 'mysql':
        raise RuntimeError('Expected the active MySQL database, not the legacy SQLite file.')
    directory = output / 'database'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'ad-meta.sql.gz'
    if target.exists():
        raise RuntimeError('Backup already exists; use a new output directory.')
    print('Capturing current MySQL state and immutable file checks...', flush=True)
    before = source_state()
    candidates = [shutil.which('mysqldump'), '/usr/local/mysql/bin/mysqldump', '/opt/homebrew/bin/mysqldump']
    executable = next((str(Path(p)) for p in candidates if p and Path(p).is_file()), None)
    if not executable:
        raise RuntimeError('mysqldump is not installed.')
    handle, name = tempfile.mkstemp(prefix='admeta-local-export-', suffix='.cnf')
    os.close(handle)
    common = [executable, '--defaults-extra-file=' + name, '--single-transaction', '--quick',
              '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob',
              '--skip-add-drop-table', '--skip-comments', '--skip-add-locks', '--skip-lock-tables',
              '--skip-disable-keys', '--default-character-set=utf8mb4']
    try:
        Path(name).write_text('[client]\n' + '\n'.join(
            key + '=' + quote_option(value) for key, value in {
                'host': SETTINGS.mysql_host, 'port': SETTINGS.mysql_port, 'user': SETTINGS.mysql_user,
                'password': SETTINGS.mysql_password,
            }.items()) + '\n')
        os.chmod(name, 0o600)
        print('Exporting transaction-consistent MySQL SQL (no account/password export)...', flush=True)
        with tempfile.TemporaryFile() as stderr:
            process = subprocess.Popen(common + [SETTINGS.mysql_database], stdout=subprocess.PIPE, stderr=stderr)
            with gzip.open(target, 'wb', compresslevel=6) as destination:
                shutil.copyfileobj(process.stdout, destination)
            status = process.wait()
            if status:
                raise RuntimeError('mysqldump failed; incomplete deployment backup must not be used.')
        schema = subprocess.run(common + ['--no-data', SETTINGS.mysql_database], capture_output=True)
        if schema.returncode:
            raise RuntimeError('Schema-only backup failed.')
        (directory / 'schema.sql').write_bytes(schema.stdout)
    finally:
        Path(name).unlink(missing_ok=True)
    sql_hash = hashlib.sha256()
    size = 0
    with gzip.open(target, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            sql_hash.update(chunk)
            size += len(chunk)
    print('Rechecking source state after export...', flush=True)
    after = source_state()
    for key in ('table_counts', 'datasets', 'cohorts', 'alembic_revision', 'chart_artifacts', 'derived_files'):
        if before[key] != after[key]:
            raise RuntimeError('Source changed during backup: ' + key + '. Start a fresh snapshot.')
    save(directory / 'source-state.json', before)
    save(directory / 'backup-verification.json', {
        'status': 'exported_and_gzip_readback_verified', 'source_version': before['server_version'],
        'tables': len(before['table_counts']), 'compressed_bytes': target.stat().st_size,
        'compressed_sha256': sha256(target), 'sql_bytes': size, 'sql_sha256': sql_hash.hexdigest(),
        'source_before_after_equal': True, 'local_restore_test': 'pending',
        'target_server_restore_test': 'pending', 'server_installed_dependencies': False,
    })
    print(json.dumps({'database_export': 'verified', 'tables': len(before['table_counts']),
                      'sql_bytes': size, 'compressed_bytes': target.stat().st_size}, ensure_ascii=False), flush=True)


EXCLUDE_PARTS = {'.git', '.venv', 'node_modules', '.tmp', '__pycache__', '.pytest_cache', '.ruff_cache',
                 '.mypy_cache', 'coverage', '.DS_Store', '.Rprofile'}


def include(path, relative):
    if any(part in EXCLUDE_PARTS or part.startswith('._') for part in relative.parts):
        return False
    if path.name.startswith('.env') and path.name != '.env.example':
        return False
    if path.suffix in ('.pyc', '.pyo', '.log'):
        # Raw/provenance logs are scientific source evidence and remain included.
        if not relative.as_posix().startswith(('backend/storage/', 'ADMetaData/')):
            return False
    text = relative.as_posix()
    if text.startswith(('frontend/output/', 'frontend/test-results/', 'stats-worker/renv/library/',
                        'stats-worker/renv/staging/', 'stats-worker/renv/cache/', 'backend/storage/staging/')):
        return False
    if text == 'backend/storage/ad_meta.sqlite3' or path.name in ('.credentials.yaml', 'id_rsa', 'id_ed25519'):
        return False
    return True


def stage_files(output):
    app = output / 'app'
    if app.exists():
        raise RuntimeError('Staged app already exists; do not mix snapshots.')
    app.mkdir()
    count = 0
    total = 0
    print('Copying source, production frontend and scientific runtime files...', flush=True)
    directories = ('backend', 'frontend', 'stats-worker', 'ADMetaData', 'data-packages', 'scripts', 'docs')
    sources = []
    for directory in directories:
        for parent, names, files in os.walk(ROOT / directory, followlinks=False):
            parent = Path(parent)
            names[:] = [name for name in names if include(parent / name, (parent / name).relative_to(ROOT))]
            for name in files:
                source = parent / name
                relative = source.relative_to(ROOT)
                if include(source, relative):
                    sources.append((source, relative))
    for name in ('README.md', 'AGENTS.md', 'package.json', '.env.example', '.gitignore', 'Start-ADMeta.ps1'):
        if (ROOT / name).is_file():
            sources.append((ROOT / name, Path(name)))
    for name in ('微脑智库_商业计划书_agent阅读版.md', '微脑智库_商业计划书_结构化版.md', 'AD宏基因组生物信息分析流程_agent阅读版.md'):
        if (ROOT / 'doc' / name).is_file():
            sources.append((ROOT / 'doc' / name, Path('doc') / name))
    for source, relative in sources:
        if source.is_symlink():
            raise RuntimeError('Unexpected symlink requires explicit review: ' + str(relative))
        destination = app / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        before = source.stat()
        shutil.copy2(source, destination)
        if before.st_size != source.stat().st_size or before.st_mtime_ns != source.stat().st_mtime_ns:
            raise RuntimeError('Source changed during copy: ' + str(relative))
        count += 1
        total += destination.stat().st_size
    shutil.copytree(ROOT / 'deploy/tencent-cloud', output / 'deploy', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ('README.md', 'SERVER_AI_DEPLOY.md', 'UPLOAD_FROM_MAC.md', 'KNOWN_LIMITATIONS.md'):
        shutil.copy2(ROOT / 'deploy/tencent-cloud' / name, output / name)
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    save(output / 'source-files.json', {'files_copied': count, 'bytes_copied': total, 'git_head_reference': head,
                                     'working_tree_included': True, 'ignored_runtime_data_included': True,
                                     'local_dotenv_included': False, 'legacy_sqlite_included': False})
    print(json.dumps({'staged_files': count, 'staged_bytes': total}), flush=True)


def archive(output):
    verification = json.loads((output / 'database/backup-verification.json').read_text())
    if verification.get('local_restore_test') != 'passed':
        raise RuntimeError('Complete the isolated local SQL restore/API test before final packaging.')
    entries = []
    for path in sorted(output.rglob('*')):
        if path.is_file() and path != output / 'manifest.json':
            relative = path.relative_to(output).as_posix()
            if path.is_symlink():
                raise RuntimeError('Symlink in bundle: ' + relative)
            entries.append({'path': relative, 'bytes': path.stat().st_size, 'sha256': sha256(path)})
    save(output / 'manifest.json', {'format': 'admeta-deployment-v1', 'created_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
                                 'files': entries, 'runtime_dependencies_installed_on_target': False,
                                 'target_server_verified': False})
    subprocess.run([sys.executable, str(output / 'deploy/verify-bundle.py'), str(output)], check=True)
    destination = output.with_suffix('.tar.gz')
    partial = destination.with_name(destination.name + '.part')
    if destination.exists():
        raise RuntimeError('Archive already exists; use a new output directory.')
    print('Compressing the verified deployment bundle...', flush=True)
    with tarfile.open(partial, 'w:gz', compresslevel=6) as package:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                info = package.gettarinfo(str(path), arcname=output.name + '/' + path.relative_to(output).as_posix())
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mode = 0o755 if path.suffix == '.sh' else 0o644
                with path.open('rb') as handle:
                    package.addfile(info, handle)
    partial.replace(destination)
    print('Reading every compressed archive member back and verifying its SHA-256...', flush=True)
    expected = {entry['path']: entry['sha256'] for entry in entries}
    expected['manifest.json'] = sha256(output / 'manifest.json')
    checked = set()
    with tarfile.open(destination, 'r:gz') as package:
        for member in package:
            relative = Path(member.name).relative_to(output.name).as_posix()
            if not member.isfile() or relative not in expected:
                raise RuntimeError('Unexpected archive member: ' + member.name)
            result = hashlib.sha256()
            handle = package.extractfile(member)
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                result.update(chunk)
            if result.hexdigest() != expected[relative]:
                raise RuntimeError('Archive readback mismatch: ' + relative)
            checked.add(relative)
    if checked != set(expected):
        raise RuntimeError('Archive contains missing files.')
    checksum = sha256(destination)
    destination.with_name(destination.name + '.sha256').write_text(checksum + '  ' + destination.name + '\n')
    save(destination.with_name(destination.name + '.verification.json'), {
        'status': 'archive_readback_verified', 'archive': destination.name, 'bytes': destination.stat().st_size,
        'sha256': checksum, 'files_verified': len(checked), 'local_restore_test': 'passed',
        'server_deployment': 'not_performed', 'target_mysql_version_test': 'pending',
    })
    print(json.dumps({'archive': str(destination), 'bytes': destination.stat().st_size,
                      'sha256': checksum, 'files_verified': len(checked)}, ensure_ascii=False), flush=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('export', 'stage', 'archive'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT not in output.parents:
        parser.error('Output must be a dedicated directory below this repository.')
    output.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    {'export': export_database, 'stage': stage_files, 'archive': archive}[args.phase](output)


if __name__ == '__main__':
    main()
