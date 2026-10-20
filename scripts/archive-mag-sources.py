"""Copy a delivery into raw without changing originals or overwriting different files."""
import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def archive(source, destination):
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Source and destination must be separate directories')
    entries = []
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Refusing to archive a symlink: {path}')
        if not path.is_file():
            continue
        if path.is_symlink() or path.name.endswith('.###'):
            raise ValueError(f'Unfinished transfer or symlink: {path}')
        relative = path.relative_to(source)
        # The representative inventory belongs to the dereplication results.
        if relative.as_posix() == 'representative_mag_files.txt':
            relative = Path('dRep') / relative
        target = destination / relative
        before = path.stat()
        digest = sha256(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if sha256(target) != digest:
                raise ValueError(f'Refusing to overwrite different archived data: {target}')
        else:
            shutil.copy2(path, target)
        if sha256(target) != digest or path.stat().st_size != before.st_size or path.stat().st_mtime_ns != before.st_mtime_ns:
            raise ValueError(f'Copy verification failed: {path}')
        entries.append({'path': relative.as_posix(), 'bytes': before.st_size, 'sha256': digest,
                        'source_path': str(path)})
    inventory = destination / 'files.tsv'
    with inventory.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=['path', 'bytes', 'sha256', 'source_path'], delimiter='\t')
        writer.writeheader()
        writer.writerows(entries)
    return {'files': len(entries), 'bytes': sum(row['bytes'] for row in entries), 'destination': str(destination)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(archive(args.source, args.destination), ensure_ascii=False))
