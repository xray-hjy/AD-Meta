"""计算模块的文件读写和 JSON 序列化工具。

图表计算中会产生 numpy 数值、数组等对象，不能直接被 `json.dumps` 序列化。
本模块把这些对象统一转换成普通 Python 类型，保证写出的缓存 JSON 稳定可读。
"""

from __future__ import annotations

import json
import math
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def read_table(path: Path) -> pd.DataFrame:
    """读取导入命令支持的原始宽表文件。

    支持 Excel、CSV、TSV 三类来源。返回值仍是原始列结构，后续由
    `prepare_dataframe` 负责检查样本列、分组列和特征列。
    """

    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, engine="openpyxl")
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".tsv":
        return pd.read_csv(path, sep="\t")
    raise ValueError(f"Unsupported file type: {suffix}")


def jsonable(value: Any) -> Any:
    """把计算结果递归转换成 JSON 可以安全写出的基础类型。

    主要处理三类情况：
    - numpy 数组转换成 list。
    - numpy 数值转换成 int/float。
    - NaN/inf 等非有限浮点数转换成 0.0，避免生成非法 JSON。
    """

    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, np.ndarray):
        return jsonable(value.tolist())
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return f if math.isfinite(f) else 0.0
    return value


def write_json(path: Path, payload: Any) -> None:
    """把某个图表 payload 写入缓存 JSON 文件。

    导入流程会对每个 chart_type 调用一次本函数，最终文件会被 API 层按
    `chart_artifacts.cache_path` 读取并返回给前端。
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(jsonable(payload), ensure_ascii=False, indent=2)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass
