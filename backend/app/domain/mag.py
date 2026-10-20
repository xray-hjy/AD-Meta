"""MAG query models independent of file delivery formats and package versions."""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


class MagDataError(ValueError):
    def __init__(self, file: str, expected: str, actual: Any, version: str = ''):
        self.report = {'file': file, 'expected': expected, 'actual': str(actual),
                       'impact': '对应 MAG 结果不可用；已发布的其他结果不受影响。',
                       'reproduce': 'npm run validate:mag',
                       'remediation': '核对 raw 原文件和导入报告，重新导入该数据集。'}
        super().__init__(f'{file}: expected {expected}; got {actual}')


@dataclass(frozen=True)
class MagScope:
    disease: str = ''
    gender: str = ''
    batch: str = ''
    age_min: float | None = None
    age_max: float | None = None
    abundance_threshold_percent: float = 0

    def as_dict(self):
        return {'disease': self.disease, 'gender': self.gender, 'batch': self.batch,
                'ageMin': self.age_min, 'ageMax': self.age_max,
                'abundanceThresholdPercent': self.abundance_threshold_percent}


@dataclass(frozen=True, eq=False)
class MagDataset:
    root: Path
    version: str  # Stable cohort key; retained in the chart response contract.
    sample_ids: tuple[str, ...]
    mag_ids: tuple[str, ...]
    matrix: np.ndarray
    samples: tuple[dict[str, Any], ...]
    lengths: tuple[int, ...]
    fingerprint: str  # Immutable release identity, not a user-maintained version name.
    sources: tuple[dict[str, Any], ...]
    max_mapping_error: float
    taxonomy: tuple[dict[str, Any], ...] = ()
    quality: tuple[dict[str, Any], ...] = ()
    annotation_manifest: dict[str, Any] | None = None
    lineage: tuple[dict[str, Any], ...] = ()
    crosswalk: tuple[dict[str, Any], ...] = ()
    storage_backend: str = 'database'
    modules: dict[str, Any] = field(default_factory=dict)
    processing: dict[str, Any] = field(default_factory=dict)
    community_results: dict[str, Any] = field(default_factory=dict)
