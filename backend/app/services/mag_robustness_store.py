"""Read and install complete associations keyed by the immutable source release."""

from __future__ import annotations

import csv
import hashlib
import logging
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import STORAGE_ROOT
from app.domain.mag import MagDataset
from app.domain.mag_robustness import (
    ANALYSIS_VERSION,
    Association,
    BatchOmission,
    Estimate,
    RobustnessManifest,
    SampleCounts,
)
from app.services.csv_export import SpreadsheetSafeDictWriter

MAIN = 'associations.csv'
SENSITIVITY = 'leave-one-batch-out.csv'
METHODS_FILE = 'methods-and-qc.json'
REPORT_FILES = (MAIN, SENSITIVITY, METHODS_FILE)
DOWNLOADS = {'associations': MAIN, 'sensitivity': SENSITIVITY, 'methods': METHODS_FILE}
COUNTS = tuple(SampleCounts.model_fields)
IDENTITY = ('datasetKey', 'release', 'analysisVersion')
NESTED_FIELDS = {'unadjusted', 'adjusted', 'estimate'}
LOGGER = logging.getLogger(__name__)


def sha256(path: Path) -> str:
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def csv_fields(model, models):
    fields = [key for key in model.model_fields if key not in NESTED_FIELDS]
    return [*IDENTITY, *fields, *[f'{name}_{key}' for name in models for key in Estimate.model_fields]]


def write_table(path, rows, identity, model, models):
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = SpreadsheetSafeDictWriter(file, csv_fields(model, models))
        writer.writeheader()
        for row in rows:
            flattened = row.model_dump(exclude=NESTED_FIELDS)
            for name in models:
                flattened.update({f'{name}_{key}': value for key, value in getattr(row, name).model_dump().items()})
            writer.writerow({**identity, **flattened})


def read_table(path, identity, model, models):
    with path.open(encoding='utf-8', newline='') as file:
        reader = csv.DictReader(file, strict=True)
        if reader.fieldnames != csv_fields(model, models):
            raise ValueError(f'{path.name} 列结构不匹配。')
        for row in reader:
            if None in row or None in row.values() or any(row[key] != identity[key] for key in IDENTITY):
                raise ValueError(f'{path.name} 行与当前发布不匹配。')
            values = {key: row[key] or None for key in model.model_fields if key not in NESTED_FIELDS}
            values.update({name: {key: row[f'{name}_{key}'] or None for key in Estimate.model_fields} for name in models})
            yield model.model_validate(values)


@dataclass(frozen=True)
class RobustnessBundle:
    path: Path
    manifest: RobustnessManifest
    associations: dict[str, Association]
    sensitivity: dict[str, list[BatchOmission]]


def write_bundle(path, summary, methods, quality_control, associations, sensitivity):
    identity = summary.model_dump(include=set(IDENTITY))
    write_table(path / MAIN, associations, identity, Association, ('unadjusted', 'adjusted'))
    write_table(path / SENSITIVITY, sensitivity, identity, BatchOmission, ('estimate',))
    manifest = RobustnessManifest(summary=summary, methods=methods, qualityControl=quality_control,
                                  files={name: sha256(path / name) for name in (MAIN, SENSITIVITY)})
    (path / METHODS_FILE).write_text(manifest.model_dump_json(indent=2) + '\n', encoding='utf-8')


def verify_sample_counts(counts, sample_rows):
    actual = Counter(row['disease'] for row in sample_rows)
    if (counts.sampleCount, counts.adCount, counts.ncCount) != (len(sample_rows), actual['AD'], actual['NC']):
        raise ValueError('结果中的样本数与当前发布的样本记录不一致。')


def read_bundle(path: Path, data: MagDataset) -> RobustnessBundle:
    manifest = RobustnessManifest.model_validate_json((path / METHODS_FILE).read_bytes())
    summary = manifest.summary
    identity = {'datasetKey': data.version, 'release': data.fingerprint, 'analysisVersion': ANALYSIS_VERSION}
    if summary.model_dump(include=set(IDENTITY)) != identity or summary.magCount != len(data.mag_ids):
        raise ValueError('校正结果与当前队列、修订或方法版本不匹配。')
    if manifest.files != {name: sha256(path / name) for name in (MAIN, SENSITIVITY)}:
        raise ValueError('结果表的 SHA-256 与方法记录不一致。')
    sample_map = {row['sampleId']: row for row in data.samples}
    retained = manifest.qualityControl['retainedSampleIds']
    if summary.cohortSampleCount != len(sample_map) or len(retained) != len(set(retained)) or set(retained) - sample_map.keys():
        raise ValueError('校正结果的样本 ID 与当前发布不一致。')
    kept = [sample_map[sid] for sid in retained]
    verify_sample_counts(summary, kept)

    rows = list(read_table(path / MAIN, identity, Association, ('unadjusted', 'adjusted')))
    associations = {row.magId: row for row in rows}
    if len(rows) != len(associations) or associations.keys() != set(data.mag_ids):
        raise ValueError('主结果表必须与当前发布的代表 MAG 一一对应。')
    for row in rows:
        if any(getattr(row, key) != getattr(summary, key) for key in COUNTS):
            raise ValueError('主结果表中的样本数与方法记录不一致。')
    for model in ('unadjusted', 'adjusted'):
        q_values = [getattr(row, model).qValue for row in rows if getattr(row, model).qValue is not None]
        suffix = model.capitalize()
        if len(q_values) != getattr(summary, f'tested{suffix}') or sum(
            value < summary.fdrAlpha for value in q_values
        ) != getattr(summary, f'belowFdr{suffix}'):
            raise ValueError('主结果表中的 FDR 检验集合与方法记录不一致。')

    batches = summary.omittedBatches
    design_omissions = manifest.qualityControl['design']['omissions']
    if batches != sorted(design_omissions) or ('batch' in summary.covariates) != (len(batches) >= 2) or len(batches) == 1:
        raise ValueError('逐批剔除列表与方法记录中的处理批次不一致。')
    expected_samples = {}
    omitted_counts: Counter[str] = Counter()
    included = set(retained)
    for batch in batches:
        remaining = design_omissions[batch]['retainedSampleIds']
        if len(remaining) != len(set(remaining)) or set(remaining) - included or len(remaining) == len(retained):
            raise ValueError('逐批剔除的样本 ID 与主模型不一致。')
        omitted_counts.update(included.difference(remaining))
        expected_samples[batch] = [sample_map[sid] for sid in remaining]
    if batches and (set(omitted_counts) != included or any(count != 1 for count in omitted_counts.values())):
        raise ValueError('每个纳入样本必须只在一轮批次剔除中被排除。')
    sensitivity = defaultdict(list)
    pairs = set()
    for row in read_table(path / SENSITIVITY, identity, BatchOmission, ('estimate',)):
        pair = (row.magId, row.excludedBatch)
        if row.magId not in associations or row.excludedBatch not in expected_samples or pair in pairs:
            raise ValueError('逐批剔除表含无效或重复的 MAG × 批次记录。')
        verify_sample_counts(row, expected_samples[row.excludedBatch])
        pairs.add(pair)
        sensitivity[row.magId].append(row)
    if len(pairs) != len(associations) * len(batches):
        raise ValueError('逐批剔除表缺少 MAG × 批次记录。')
    for items in sensitivity.values():
        items.sort(key=lambda row: row.excludedBatch)
    return RobustnessBundle(path, manifest, associations, dict(sensitivity))


def release_path(data: MagDataset) -> Path:
    return STORAGE_ROOT / 'derived' / 'mag-robustness' / data.fingerprint / ANALYSIS_VERSION


def signatures(path: Path):
    stats = [file.stat() for file in (path / name for name in REPORT_FILES)]
    return tuple((stat.st_size, stat.st_mtime_ns, stat.st_ino) for stat in stats)


@lru_cache(maxsize=4)
def cached_bundle(path: Path, data: MagDataset, signature) -> RobustnessBundle:
    result = read_bundle(path, data)
    if signatures(path) != signature:
        raise ValueError('结果文件在读取时发生变化。')
    return result


def load_published(data: MagDataset) -> RobustnessBundle | None:
    path = release_path(data)
    try:
        return cached_bundle(path, data, signatures(path))
    except FileNotFoundError:
        return None
    except (OSError, ValueError, KeyError, TypeError, csv.Error):
        LOGGER.warning('MAG robustness artifact failed validation for release %.12s', data.fingerprint, exc_info=True)
        return None


def install_bundle(path: Path, data: MagDataset) -> Path:
    destination = release_path(data)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        read_bundle(destination, data)
        if all(sha256(path / name) == sha256(destination / name) for name in REPORT_FILES):
            return destination
        raise ValueError('该修订已有不同的同版本结果。请核对输入和方法版本。')
    # Validate the staged copy and move the entire directory into place at once.
    with TemporaryDirectory(dir=destination.parent) as tmp:
        staged = Path(tmp) / 'results'
        staged.mkdir()
        for name in REPORT_FILES:
            shutil.copyfile(path / name, staged / name)
        read_bundle(staged, data)
        staged.rename(destination)
    return destination
