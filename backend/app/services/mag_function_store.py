"""Build an immutable, indexed SQLite functional artifact; runtime never scans raw gzip files.

The small cohort module pins its content hash. Scientific rows live in normalized
tables, avoiding millions of JSON rows in the application's overview snapshot.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter
from contextlib import contextmanager
from functools import lru_cache
from itertools import zip_longest
from pathlib import Path
from threading import Lock

from app.core.config import STORAGE_ROOT

STORE_VERSION = 'mag-function-sqlite-2026-10-23.1'
NAMESPACES = {
    'kofam_ko': 'KO', 'kofam_ec': 'EC', 'dbcan_family': 'CAZyme 家族',
    'dbcan_subfamily': 'CAZyme 亚家族', 'dbcan_substrate': '底物预测',
    'merops_family': 'MEROPS 家族', 'merops_id': 'MEROPS 命中', 'dram_db': 'DRAM HMM',
}
_LOCK = Lock()


def rows(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle, delimiter='\t')
        fields = reader.fieldnames or []
        if not fields or len(fields) != len(set(fields)):
            raise ValueError(f'Invalid header: {path.name}')
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f'Nonrectangular table: {path.name}')
            yield row


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def features(row):
    """Same best-hit/scalar/semicolon conventions as the received summary README."""
    def split(key):
        return {v.strip() for v in row.get(key, '').split(';') if v.strip() not in {'', '-', 'NA', 'nan', 'None', 'null'}}
    return {
        'kofam_ko': set(re.findall(r'K\d{5}', row.get('kofam_id', ''))),
        'kofam_ec': {'EC:' + value for value in re.findall(r'\d+\.(?:\d+|-)\.(?:\d+|-)\.(?:\d+|-)', row.get('kofam_EC', ''))},
        'dbcan_family': split('dbcan_id'), 'dbcan_subfamily': split('dbcan_sub_id'),
        'dbcan_substrate': split('dbcan_sub_substrate'), 'merops_family': split('merops_family'),
        'merops_id': {row['merops_id']} if row.get('merops_id') else set(),
        'dram_db': {row['dram_db_id']} if row.get('dram_db_id') else set(),
    }


SCHEMA = '''
CREATE TABLE mags (mag_key INTEGER PRIMARY KEY, mag_id TEXT NOT NULL UNIQUE,
 domain TEXT NOT NULL, gene_count INTEGER NOT NULL, annotation_percent REAL NOT NULL, metadata_json TEXT NOT NULL);
CREATE TABLE features (feature_key INTEGER PRIMARY KEY, namespace TEXT NOT NULL,
 feature_id TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', UNIQUE(namespace,feature_id));
CREATE TABLE counts (feature_key INTEGER NOT NULL, mag_key INTEGER NOT NULL, gene_count INTEGER NOT NULL CHECK(gene_count>0),
 PRIMARY KEY(feature_key,mag_key)) WITHOUT ROWID;
CREATE TABLE genes (gene_key INTEGER PRIMARY KEY, query_id TEXT NOT NULL UNIQUE, mag_key INTEGER NOT NULL,
 contig TEXT NOT NULL, start_bp INTEGER NOT NULL, stop_bp INTEGER NOT NULL, strand INTEGER NOT NULL,
 rank TEXT NOT NULL, evidence_json TEXT NOT NULL);
CREATE TABLE hits (feature_key INTEGER NOT NULL, gene_key INTEGER NOT NULL, mag_key INTEGER NOT NULL,
 PRIMARY KEY(feature_key,gene_key)) WITHOUT ROWID;
CREATE TABLE distill (row_key TEXT PRIMARY KEY, gene_id TEXT NOT NULL, description TEXT NOT NULL,
 topic TEXT NOT NULL, module TEXT NOT NULL, workbook TEXT NOT NULL, values_json TEXT NOT NULL);
CREATE TABLE info (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
'''


def _build(path, files, dependencies):
    root = files['run'].parent
    run = json.loads(files['run'].read_text(encoding='utf-8'))
    if run.get('status') != 'SUCCESS' or run.get('exit_code') != 0:
        raise ValueError('DRAM summary run did not succeed')
    for entry in rows(files['manifest']):
        source = root / entry['file']
        if source.parent.resolve() != root.resolve() or not source.is_file():
            raise ValueError('Invalid DRAM output manifest path')
        if source.stat().st_size != int(entry['bytes']) or sha256(source) != entry['sha256']:
            raise ValueError(f'DRAM output checksum mismatch: {source.name}')
    summary_rows = list(rows(files['summary']))
    summaries = {r['MAG_ID']: r for r in summary_rows}
    expected = set(dependencies['abundance']['mag_ids'])
    if len(summary_rows) != len(summaries) or set(summaries) != expected:
        raise ValueError('DRAM representatives differ from abundance artifact')
    master_rows = list(rows(root / 'mag_master_metadata.tsv'))
    master = {r['MAG_ID']: r for r in master_rows}
    if len(master_rows) != len(master) or set(master) != expected:
        raise ValueError('Master metadata MAG identity mismatch')
    quality = {r['magId']: r for r in dependencies['quality']['quality']}
    taxonomy = {r['magId']: r for r in dependencies['taxonomy']['taxonomy']}
    lengths = {r['magId']: r['lengthBp'] for r in dependencies['abundance']['representatives']}
    quality_fields = {'Completeness': 'completenessPercent', 'Contamination': 'contaminationPercent',
                      'Contig_N50': 'contigN50Bp', 'Genome_Size': 'genomeSizeBp', 'Total_Contigs': 'totalContigs',
                      'GC_Content': 'gcContent', 'Coding_Density': 'codingDensity'}
    ranks = ('domain', 'phylum', 'class', 'order', 'family', 'genus', 'species')
    for mid, row in master.items():
        classification = ';'.join(f'{rank[0] if rank != "class" else "c"}__{taxonomy[mid][rank]}' for rank in ranks)
        if row['GTDB_taxonomy'] != classification or int(row['CoverM_length_bp']) != lengths[mid]:
            raise ValueError(f'Master taxonomy/length mismatch: {mid}')
        if int(row['DRAM2_Gene_count']) != int(summaries[mid]['Gene_count']):
            raise ValueError(f'Master gene total mismatch: {mid}')
        for source_field, field in quality_fields.items():
            if float(row['CheckM2_' + source_field]) != quality[mid][field]:
                raise ValueError(f'Master quality mismatch: {mid}/{source_field}')
    mag_keys = {mid: index + 1 for index, mid in enumerate(sorted(expected))}
    database = sqlite3.connect(path)
    try:
        database.executescript(SCHEMA)
        database.execute('PRAGMA journal_mode=OFF')
        database.execute('PRAGMA synchronous=OFF')
        database.execute('PRAGMA temp_store=MEMORY')
        database.executemany('INSERT INTO mags VALUES (?,?,?,?,?,?)', [
            (mag_keys[mid], mid, row['Domain'], int(row['Gene_count']), float(row['Any_supported_annotation_percent']),
             json.dumps(row, ensure_ascii=False)) for mid, row in summaries.items()])
        feature_keys = {}
        matrix_stats = {}
        for namespace in NAMESPACES:
            counts_file = root / f'mag_{namespace}_counts.tsv'
            presence_file = root / f'mag_{namespace}_presence.tsv'
            seen, batch = set(), []
            assignments = nonzero = 0
            for counts, presence in zip_longest(rows(counts_file), rows(presence_file)):
                if counts is None or presence is None or list(counts) != list(presence):
                    raise ValueError(f'Unpaired matrix: {namespace}')
                mid = counts['MAG_ID']
                if mid not in mag_keys or mid in seen or mid != presence['MAG_ID']:
                    raise ValueError(f'Invalid matrix MAG: {namespace}/{mid}')
                if counts['Domain'] != presence['Domain'] or counts['Domain'] != summaries[mid]['Domain']:
                    raise ValueError(f'Domain mismatch: {mid}')
                seen.add(mid)
                for feature, raw in counts.items():
                    if feature in {'MAG_ID', 'Domain'}:
                        continue
                    key = (namespace, feature)
                    if key not in feature_keys:
                        feature_keys[key] = len(feature_keys) + 1
                        database.execute('INSERT INTO features VALUES (?,?,?,?)', (feature_keys[key], namespace, feature, ''))
                    value = int(raw)
                    if value < 0 or int(presence[feature]) != int(value > 0):
                        raise ValueError(f'Presence/count mismatch: {mid}/{feature}')
                    if value:
                        batch.append((feature_keys[key], mag_keys[mid], value))
                        assignments += value
                        nonzero += 1
                if len(batch) >= 10000:
                    database.executemany('INSERT INTO counts VALUES (?,?,?)', batch)
                    batch.clear()
            if batch:
                database.executemany('INSERT INTO counts VALUES (?,?,?)', batch)
            if seen != expected:
                raise ValueError(f'Incomplete matrix: {namespace}')
            matrix_stats[namespace] = {'label': NAMESPACES[namespace], 'featureCount': sum(k[0] == namespace for k in feature_keys),
                                       'associations': nonzero, 'geneAssignments': assignments}
        print('DRAM: matrices indexed', flush=True)
        gene_totals, annotated = Counter(), Counter()
        gene_batch, hit_batch = [], []
        for index, row in enumerate(rows(files['genes']), 1):
            mid = row['input_fasta']
            if mid not in mag_keys or row['Domain'] != summaries[mid]['Domain']:
                raise ValueError(f'Unknown DRAM gene MAG: {mid}')
            start, stop, strand = int(row['start_position']), int(row['stop_position']), int(row['strandedness'])
            if min(start, stop) < 0 or strand not in {-1, 1}:
                raise ValueError('Invalid gene coordinate or strand')
            gene_totals[mid] += 1
            evidence = {k: v for k, v in row.items() if v and k not in {
                'Domain', 'query_id', 'input_fasta', 'scaffold', 'gene_number', 'start_position', 'stop_position', 'strandedness', 'rank'}}
            gene_batch.append((index, row['query_id'], mag_keys[mid], row['scaffold'], start, stop, strand,
                               row['rank'], json.dumps(evidence, ensure_ascii=False, separators=(',', ':'))))
            matched = False
            for namespace, identifiers in features(row).items():
                for identifier in identifiers:
                    feature_key = feature_keys.get((namespace, identifier))
                    if feature_key is None:
                        raise ValueError(f'Gene feature absent from matrix: {namespace}/{identifier}')
                    hit_batch.append((feature_key, index, mag_keys[mid]))
                    matched = True
                    if namespace == 'merops_id' and row.get('merops_description'):
                        # Populate descriptions once, never replace established source text.
                        if feature_key not in annotated:
                            database.execute('UPDATE features SET description=? WHERE feature_key=?', (row['merops_description'], feature_key))
                            annotated[feature_key] = 1
            if len(gene_batch) >= 4000:
                database.executemany('INSERT INTO genes VALUES (?,?,?,?,?,?,?,?,?)', gene_batch)
                database.executemany('INSERT INTO hits VALUES (?,?,?)', hit_batch)
                gene_batch.clear()
                hit_batch.clear()
            if matched:
                annotated[mid] += 1
        if gene_batch:
            database.executemany('INSERT INTO genes VALUES (?,?,?,?,?,?,?,?,?)', gene_batch)
            database.executemany('INSERT INTO hits VALUES (?,?,?)', hit_batch)
        for mid, row in summaries.items():
            if gene_totals[mid] != int(row['Gene_count']) or annotated[mid] != int(row['Any_supported_annotation_genes']):
                raise ValueError(f'Gene summary mismatch: {mid}')
        database.execute('CREATE INDEX idx_hits_mag_feature ON hits(mag_key,feature_key,gene_key)')
        database.execute('CREATE INDEX idx_counts_mag ON counts(mag_key,feature_key)')
        database.execute('CREATE INDEX idx_genes_interval ON genes(mag_key,contig,start_bp,stop_bp)')
        # Compare every namespace against independent gene extraction, not just KO.
        mismatch = database.execute('''SELECT COUNT(*) FROM (
            SELECT feature_key,mag_key,gene_count FROM counts EXCEPT
            SELECT feature_key,mag_key,COUNT(*) FROM hits GROUP BY feature_key,mag_key)''').fetchone()[0]
        extra = database.execute('''SELECT COUNT(*) FROM (
            SELECT feature_key,mag_key,COUNT(*) FROM hits GROUP BY feature_key,mag_key EXCEPT
            SELECT feature_key,mag_key,gene_count FROM counts)''').fetchone()[0]
        if mismatch or extra:
            raise ValueError(f'Gene/matrix mismatches: {mismatch + extra}')
        print('DRAM: gene evidence validated', flush=True)
        discrepancies = []
        single_ko_rows = differing_rows = differing_cells = 0
        workbook_counts = Counter()
        for row in rows(files['distill']):
            metadata = [row[k] for k in ('gene_id', 'gene_description', 'topic_ecosystem', 'module', 'workbook')]
            row_key = hashlib.sha256(json.dumps(metadata).encode()).hexdigest()
            values = {mid: int(row[mid]) for mid in mag_keys if int(row[mid])}
            database.execute('INSERT INTO distill VALUES (?,?,?,?,?,?,?)', (row_key, *metadata, json.dumps(values)))
            workbook_counts[row['workbook']] += 1
            feature_key = feature_keys.get(('kofam_ko', row['gene_id']))
            if feature_key and re.fullmatch(r'K\d{5}', row['gene_id']):
                single_ko_rows += 1
                source = {r[0]: r[1] for r in database.execute('SELECT m.mag_id,c.gene_count FROM counts c JOIN mags m USING(mag_key) WHERE feature_key=?', (feature_key,))}
                differences = sum(values.get(mid, 0) != source.get(mid, 0) for mid in mag_keys)
                if differences:
                    differing_rows += 1
                    differing_cells += differences
                    if len(discrepancies) < 20 or row['gene_id'] in {'K00929', 'K00634', 'K01580', 'K01442'}:
                        discrepancies.append({'featureId': row['gene_id'], 'description': row['gene_description'],
                                              'matrixGeneCount': sum(source.values()), 'distillSum': sum(values.values()), 'differingMags': differences})
                database.execute('UPDATE features SET description=? WHERE feature_key=? AND description=?', (row['gene_description'], feature_key, ''))
        report = {'storeVersion': STORE_VERSION, 'magCount': len(mag_keys), 'geneCount': sum(gene_totals.values()),
                  'namespaces': matrix_stats, 'allGeneMatricesValidated': True, 'masterMetadataValidated': True,
                  'runId': run['inputs']['DRAM_run_id'], 'summaryRunId': run['run_stamp'],
                  'distill': {'status': 'requires_review' if differing_rows else 'consistent_single_ko',
                              'singleKoRows': single_ko_rows, 'differingRows': differing_rows, 'differingCells': differing_cells,
                              'examples': discrepancies, 'workbooks': dict(workbook_counts)},
                  'coordinateConvention': 'DRAM source start_position/stop_position; raw coordinates retained',
                  'tool': {'name': 'DRAM2', 'databases': list(NAMESPACES)},
                  'storage': 'immutable-indexed-sqlite', 'status': 'ready'}
        database.execute('INSERT INTO info VALUES (?,?)', ('report', json.dumps(report, ensure_ascii=False)))
        database.commit()
        database.execute('ANALYZE')
        if database.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('Functional artifact integrity check failed')
        return report
    finally:
        database.close()


def parse_dram(files, dependencies, spec):
    directory = STORAGE_ROOT / 'derived' / 'mag-functions'
    directory.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='building-', suffix='.sqlite', dir=directory)
    os.close(handle)
    path = Path(name)
    try:
        report = _build(path, files, dependencies)
        content_hash = sha256(path)
        destination = directory / (content_hash + '.sqlite')
        if destination.exists():
            if sha256(destination) != content_hash:
                raise ValueError('Existing functional artifact has invalid content')
            path.unlink()
        else:
            path.replace(destination)
        report['database'] = {'file': destination.relative_to(STORAGE_ROOT).as_posix(),
                              'sha256': content_hash, 'bytes': destination.stat().st_size}
        return {}, report
    finally:
        if path.exists():
            path.unlink()


@lru_cache(maxsize=16)
def _verified(path, size, modified, checksum):
    if sha256(Path(path)) != checksum:
        raise ValueError('Functional artifact checksum mismatch; restore the pinned artifact')
    return path


@contextmanager
def open_store(data):
    module = data.modules.get('metabolism', {})
    if module.get('status') != 'ready' or 'database' not in module:
        raise ValueError('当前发布没有已导入的 DRAM 功能结果，请导入声明的队列结果。')
    entry = module['database']
    path = (STORAGE_ROOT / entry['file']).resolve()
    if not path.is_relative_to((STORAGE_ROOT / 'derived' / 'mag-functions').resolve()) or not path.is_file():
        raise ValueError('该修订的功能查询数据库未挂载，请恢复已固定的派生文件。')
    stat = path.stat()
    if stat.st_size != entry['bytes']:
        raise ValueError('Functional artifact size mismatch')
    with _LOCK:
        _verified(str(path), stat.st_size, stat.st_mtime_ns, entry['sha256'])
    conn = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA query_only=ON')
    try:
        yield conn
    finally:
        conn.close()
