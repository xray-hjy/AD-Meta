"""仪表盘统计卡片数据计算。

这个 payload 对应 `/api/datasets/{slug}/summary`，前端侧边栏的样本数、
特征数、AD/NC 数量都从这里读取。
"""

from __future__ import annotations

import pandas as pd

from app.compute.common import AD, FEATURE_META, NC


def compute_summary(df: pd.DataFrame, species_cols: list[str], slug: str, name: str, published_at: str) -> dict:
    """汇总数据集级别的基础信息。

    `species_cols` 实际表示所有特征列：物种数据时是物种，KO 数据时是 KO。
    为兼容旧前端，payload 同时保留 `totalSpecies` 和 `totalFeatures`。
    """

    group_counts = df["Group"].value_counts().to_dict()
    feature_kind = df.attrs.get("feature_kind", "taxonomy")
    feature_label = df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"])
    return {
        "datasetSlug": slug,
        "datasetName": name,
        "featureKind": feature_kind,
        "featureLabel": feature_label,
        "totalSamples": int(len(df)),
        "adSamples": int(group_counts.get(AD, 0)),
        "ncSamples": int(group_counts.get(NC, 0)),
        "totalFeatures": int(len(species_cols)),
        "totalSpecies": int(len(species_cols)),
        "groupCounts": {str(k): int(v) for k, v in group_counts.items()},
        "publishedAt": published_at,
    }
