"""Fit and install release-pinned MAG robustness results without changing cohort data."""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import numpy as np

from app.core.config import BACKEND_ROOT, RAW_ROOT, SETTINGS
from app.services.cohort_repository import release_sources
from app.services.mag_analysis_service import load_mag_dataset
from app.services.mag_robustness_store import install_bundle, read_bundle, sha256, write_bundle


def validate_protocol(data, config, inputs):
    if (config['datasetKey'], config['release'], config['projectAccession']) != (
        data.version, data.fingerprint, data.cohort_info['projectAccession'],
    ) or not config.get('observationUnitNote'):
        raise ValueError('分析协议须与当前发布精确匹配，并说明观测单位的核验依据。')
    batch = config.get('processingBatch')
    if not batch:
        return
    trusted = any(row['file'] == batch['sourceFile'] and row['sha256'] == batch['sourceSha256']
                  for row in inputs['samples']['files'])
    if batch.get('canonicalField') != 'batch' or not trusted or not all(
        batch.get(key) for key in ('sourceColumn', 'definition', 'definitionSource')
    ):
        raise ValueError('技术处理批次映射需要源文件指纹、明确列定义和当前修订的匹配记录。')


def checked_file(path, sources):
    match = next((item for item in sources if item['file'] == path), None)
    file = (BACKEND_ROOT / path).resolve()
    if match is None or not file.is_relative_to(RAW_ROOT.resolve()) or sha256(file) != match['sha256']:
        raise ValueError(f'原始输入与发布记录的 SHA-256 不一致：{path}')
    return file


def unique_rows(file, key, delimiter):
    with file.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=delimiter, strict=True)
        if reader.fieldnames is None or key not in reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError(f'{file.name} 表头缺少 {key} 或含重复列。')
        result = {}
        for row in reader:
            value = row[key]
            if not value or value in result or None in row or None in row.values():
                raise ValueError(f'{file.name} 含缺失或重复 ID，或行长度不一致。')
            result[value] = row
        return result, [field for field in reader.fieldnames if field != key]


def bind_processing_batch(data, config, inputs):
    batch = config.get('processingBatch')
    if not batch:
        return data
    source = checked_file(batch['sourceFile'], inputs['samples']['files'])
    metadata, _ = unique_rows(source, batch.get('sampleIdColumn', 'sample_id'), '\t' if source.suffix == '.tsv' else ',')
    if metadata.keys() != set(data.sample_ids):
        raise ValueError('批次来源表与发布中的样本 ID 不一致。')
    # Interpret the declared source column for this model. The archive and the
    # database records used by the existing sample filters stay intact.
    samples = tuple({**row, 'batch': metadata[row['sampleId']].get(batch['sourceColumn'], '').strip()} for row in data.samples)
    return replace(data, samples=samples)


def verify_archive(data, config, inputs):
    spec = config['archiveCheck']
    metadata_file = checked_file(spec['metadataFile'], inputs['samples']['files'])
    matrix_file = checked_file(spec['matrixFile'], inputs['abundance']['files'])
    metadata, _ = unique_rows(metadata_file, 'sample_id', ',')
    matrix, mag_ids = unique_rows(matrix_file, 'Sample', '\t')
    if set(metadata) != set(matrix) or set(metadata) != set(data.sample_ids) or set(mag_ids) != set(data.mag_ids):
        raise ValueError('原始元数据、矩阵与发布中的样本或 MAG 集合不一致。')
    original = np.asarray([[float(matrix[sid][mid]) for mid in data.mag_ids] for sid in data.sample_ids])
    tolerance = spec.get('readbackRelativeTolerance', 0)
    if not np.allclose(data.matrix, original, rtol=tolerance, atol=0, equal_nan=True):
        raise ValueError('原始丰度与发布矩阵存在超出已记录读回精度的差异。')
    batch = config.get('processingBatch')
    for sample in data.samples:
        raw = metadata[sample['sampleId']]
        fields = {'disease': 'disease', 'gender': 'Gender', 'sampleName': 'Sample_name',
                  'accession': 'Accession', 'sourceGroup': 'Group'}
        if batch and batch['sourceFile'] == spec['metadataFile'] and batch['sourceColumn'] in raw:
            fields['batch'] = batch['sourceColumn']
        if any((raw[source] or '') != (sample.get(target) or '') for target, source in fields.items()) or (
            float(raw['Age']) if raw['Age'] else None
        ) != sample['age']:
            raise ValueError('原始元数据与发布样本协变量不一致。')
    shared = np.isfinite(original) & np.isfinite(data.matrix)
    positive = shared & (original > 0)
    delta = np.abs(data.matrix[shared] - original[shared])
    report = {'status': 'verified', **spec, 'matchedSamples': len(metadata), 'matchedMAGs': len(mag_ids),
              'verifiedCells': data.matrix.size, 'finiteCellsWithReadbackRounding': int(np.count_nonzero(delta)),
              'maxAbsoluteReadbackDifferencePercentPoints': float(delta.max()) if delta.size else None,
              'maxRelativeReadbackDifference': float(np.max(np.abs(data.matrix[positive] / original[positive] - 1)))
              if positive.any() else None}
    original.setflags(write=False)
    return original, report


def fit_to_directory(data, protocol_file, destination):
    from app.services.mag_robustness_fit import METHODS, fit_cohort

    config = json.loads(protocol_file.read_text(encoding='utf-8'))
    inventories = release_sources(data.fingerprint)
    inputs: dict[str, Any] = {name: {'revision': data.modules[name]['revision'], 'files': inventories[name]['files']}
                              for name in ('samples', 'abundance')}
    validate_protocol(data, config, inputs)
    model_data = bind_processing_batch(data, config, inputs)
    if config.get('archiveCheck'):
        original, inputs['archiveCheck'] = verify_archive(model_data, config, inputs)
        model_data = replace(model_data, matrix=original)
    inputs['abundanceBasis'] = 'verified raw CoverM percent' if config.get('archiveCheck') else 'pinned snapshot percent'
    summary, qc, rows, omissions = fit_cohort(model_data, config, inputs)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError('输出目录已存在，请指定新的结果目录。')
    with TemporaryDirectory(dir=destination.parent) as tmp:
        staged = Path(tmp) / 'results'
        staged.mkdir()
        write_bundle(staged, summary, METHODS, qc, rows, omissions)
        read_bundle(staged, data)
        staged.rename(destination)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest='action', required=True)
    fit = subparsers.add_parser('fit', help='run full-cohort OLS/HC3 and write two result tables and a QC record')
    fit.add_argument('--protocol', required=True, type=Path)
    fit.add_argument('--output', required=True, type=Path)
    install = subparsers.add_parser('install', help='validate and install a fitted bundle for the exact release')
    install.add_argument('--input', required=True, type=Path)
    for command in (fit, install):
        command.add_argument('--dataset', default=SETTINGS.mag_dataset)
        command.add_argument('--revision', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{64}', args.revision):
        parser.error('--revision must be the full immutable data fingerprint')
    data = load_mag_dataset(args.dataset, args.revision)
    if args.action == 'fit':
        summary = fit_to_directory(data, args.protocol, args.output)
        print(summary.model_dump_json(indent=2))
        print(args.output.resolve())
    else:
        print(install_bundle(args.input, data))


if __name__ == '__main__':
    main()
