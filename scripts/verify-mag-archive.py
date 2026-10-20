"""Verify a hard-disk raw delivery using its archived SHA-256 inventory."""
import argparse
import csv
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('archive_mag', Path(__file__).with_name('archive-mag-sources.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    root = args.directory.resolve()
    count = 0
    with (root/'files.tsv').open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream, delimiter='\t'):
            path = (root/row['path']).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError(f'Missing or invalid archived file: {row["path"]}')
            if path.stat().st_size != int(row['bytes']) or archive.sha256(path) != row['sha256']:
                raise ValueError(f'Archive verification failed: {row["path"]}')
            count += 1
    print(f'Verified {count} archived files')


if __name__ == '__main__':
    main()
