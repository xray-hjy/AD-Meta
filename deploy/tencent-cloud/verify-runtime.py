#!/usr/bin/env python3
"""Read-only checks for published state and its portable runtime files."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


def sha256(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app-root', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    args = parser.parse_args()
    app = args.app_root.resolve()
    source = json.loads(args.source_state.read_text())
    sys.path.insert(0, str(app / 'backend'))
    from app.core.database import connect
    errors = []
    with connect() as connection:
        datasets = [dict(r) for r in connection.execute('SELECT slug,current_revision_id FROM datasets ORDER BY slug').fetchall()]
        cohorts = [dict(r) for r in connection.execute('SELECT cohort_key,current_release FROM cohorts ORDER BY cohort_key').fetchall()]
        if datasets != source['datasets']:
            errors.append('Dataset revisions differ from source')
        if cohorts != source['cohorts']:
            errors.append('Cohort releases differ from source')
        rows = connection.execute('''SELECT a.cache_path,a.sha256 FROM revision_chart_artifacts a
                   JOIN datasets d ON d.current_revision_id=a.revision_id''').fetchall()
        for row in rows:
            relative = Path(row['cache_path'])
            if relative.is_absolute() or '..' in relative.parts:
                errors.append('Chart path is not portable: ' + str(relative))
                continue
            path = app / 'backend' / relative
            if not path.is_file() or sha256(path) != row['sha256']:
                errors.append('Missing/changed chart: ' + str(relative))
    for item in source['derived_files']:
        path = app / item['path']
        if not path.is_file() or path.stat().st_size != item['bytes'] or sha256(path) != item['sha256']:
            errors.append('Missing/changed functional index: ' + item['path'])
            continue
        with sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True) as database:
            if database.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                errors.append('SQLite integrity failure: ' + item['path'])
    report = {'status': 'invalid' if errors else 'verified', 'datasets': datasets, 'cohorts': cohorts,
              'chart_files_checked': len(rows), 'functional_indexes_checked': len(source['derived_files']),
              'preexisting_historical_chart_gaps': len(source.get('historical_chart_gaps', [])), 'errors': errors}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
