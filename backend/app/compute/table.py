"""原始宽表标准化逻辑。

图表函数不直接面对用户上传/内置原始文件，而是统一接收本模块处理后的
DataFrame。这里负责识别样本列、分组列、物种列或 KO 列，并把丰度值转成
可计算的非负数。
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .common import AD, NC, FEATURE_META, KO_RE
from .io import read_table


def prepare_dataframe(path: Path) -> tuple[pd.DataFrame, list[str], list[str]]:
    """读取并标准化一份 AD/NC 宽表。

    输入文件要求：
    - 样本列：优先 `sample_id`，兼容旧列名 `Sample`。
    - 分组列：优先 `Group`，兼容 `label`。
    - 特征列：物种列以 `k__` 开头，KO 列形如 `K00001`。

    Returns:
        df: 增加了标准化 `Group`、`Sample` 列和 attrs 元数据的数据表。
        species_cols: 实际参与图表计算的特征列。
        warnings: 非数字值转换等可展示给导入流程的提示。
    """

    warnings: list[str] = []
    df = read_table(path)
    df.columns = [str(col).strip() for col in df.columns]

    # 兼容新旧两套输入列名，统一输出为后续计算使用的 `Sample` 和 `Group`。
    sample_col = "sample_id" if "sample_id" in df.columns else "Sample" if "Sample" in df.columns else None
    group_col = "Group" if "Group" in df.columns else "label" if "label" in df.columns else None
    missing = []
    if group_col is None:
        missing.append("Group or label")
    if sample_col is None:
        missing.append("sample_id or Sample")
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(missing)}")

    # 物种数据和 KO 数据使用同一个计算管线，但通过列名规则区分 feature 类型。
    taxonomy_cols = [col for col in df.columns if col.startswith("k__")]
    ko_cols = [col for col in df.columns if KO_RE.fullmatch(col)]
    species_cols = taxonomy_cols or ko_cols
    if not species_cols:
        raise ValueError("No abundance feature columns found. Expected columns starting with k__ or KO columns like K00001.")

    # 这些 attrs 会被 summary、图表标题和前端标签读取。
    feature_kind = "taxonomy" if taxonomy_cols else "ko"
    df.attrs["feature_kind"] = feature_kind
    df.attrs["feature_label"] = FEATURE_META[feature_kind]["label"]
    df.attrs["composition_label"] = FEATURE_META[feature_kind]["compositionLabel"]
    df.attrs["taxonomy_label"] = FEATURE_META[feature_kind]["taxonomyLabel"]

    # 二分类 label 文件里可能用 1/0 表示 AD/NC，这里统一成字符串分组名。
    groups = df[group_col].astype(str).str.strip().str.upper()
    if set(groups.dropna()) <= {"0", "1"}:
        groups = groups.map({"1": AD, "0": NC})
    df["Group"] = groups

    if AD not in set(groups) or NC not in set(groups):
        raise ValueError("The first version requires both AD and NC groups.")

    # 丰度矩阵必须是非负数；空值或文本转成 0 并记录 warning。
    abundance = df[species_cols].apply(pd.to_numeric, errors="coerce")
    non_numeric = int(abundance.isna().sum().sum())
    if non_numeric:
        warnings.append(f"Converted {non_numeric} empty or non-numeric abundance cells to 0.")
    abundance = abundance.fillna(0).clip(lower=0)
    df[species_cols] = abundance
    df = df.copy()
    df["Sample"] = df[sample_col].astype(str).str.strip()

    return df, species_cols, warnings
