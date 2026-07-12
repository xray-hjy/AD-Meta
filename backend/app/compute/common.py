"""图表计算共享常量和分组工具。

这里放所有图表都会用到的最小公共概念：
- AD/NC 两个固定分组名。
- KO 列名识别规则。
- feature 元数据，用来让同一套图表逻辑兼容物种和 KO 功能数据。
"""

from __future__ import annotations

import re

import pandas as pd

# 后端预计算目前只支持 AD vs NC 两组对比，图表 payload 也围绕这两个名字组织。
AD = "AD"
NC = "NC"

# KO 功能列采用 K00001 这类 KEGG Orthology 编号格式。
KO_RE = re.compile(r"^K\d{5}$")

# DataFrame.attrs 里会保存这些元数据，后续图表函数用它决定显示“物种”还是“KO”。
FEATURE_META = {
    "taxonomy": {
        "label": "物种",
        "compositionLabel": "门级组成",
        "sunburstLabel": "分类旭日图",
    },
    "ko": {
        "label": "KO",
        "compositionLabel": "KO 功能组成",
        "sunburstLabel": "KO 旭日图",
    },
}


def group_frames(df: pd.DataFrame, species_cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """按 AD/NC 分组切出只包含丰度特征列的两个 DataFrame。

    Args:
        df: `prepare_dataframe` 标准化后的数据表，必须包含 `Group` 列。
        species_cols: 实际参与计算的特征列，可能是物种列，也可能是 KO 列。

    Returns:
        `(ad, nc)`：两个只保留特征列的 DataFrame，行顺序保持原始样本顺序。
    """

    ad = df.loc[df["Group"] == AD, species_cols]
    nc = df.loc[df["Group"] == NC, species_cols]
    return ad, nc
