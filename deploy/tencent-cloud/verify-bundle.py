#!/usr/bin/env python3
"""Verify a deployment directory before running installers or restoring SQL."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', nargs='?', default=str(Path(__file__).resolve().parent.parent))
    args = parser.parse_args()
    root = Path(args.bundle).resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    errors = []
    total = 0
    for entry in manifest['files']:
        relative = PurePosixPath(entry['path'])
        if relative.is_absolute() or '..' in relative.parts:
            errors.append('unsafe path: ' + entry['path'])
            continue
        path = root.joinpath(*relative.parts)
        if path.is_symlink() or not path.resolve().is_relative_to(root) or not path.is_file():
            errors.append('missing/unsafe file: ' + entry['path'])
        elif path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']:
            errors.append('checksum mismatch: ' + entry['path'])
        total += entry['bytes']
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    expected = {entry['path'] for entry in manifest['files']} | {'manifest.json'}
    extras = actual - expected
    if extras:
        errors.extend('unlisted file: ' + p for p in sorted(extras)[:20])
    print(json.dumps({'status': 'invalid' if errors else 'verified', 'files': len(manifest['files']),
                      'bytes': total, 'errors': errors}, ensure_ascii=False, indent=2))
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
