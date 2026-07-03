"""组成图数据计算。

物种数据集按 phylum 汇总相对丰度，KO 数据集没有分类层级，所以这里把
Top KO 当作组成项返回。前端根据 featureKind 把同一个 payload 显示成
“门级组成”或“KO 功能组成”。
"""

from __future__ import annotations

from collections import defaultdict

import pandas as pd

from app.compute.common import group_frames
from app.compute.taxonomy import get_level, short_name


def compute_phylum(df: pd.DataFrame, species_cols: list[str]) -> list[dict]:
    """计算 AD/NC 两组的组成比例。

    Returns:
        列表元素包含 `phylum`、`adRatio`、`ncRatio`。字段名沿用历史 API，
        即使 KO 数据集返回的 `phylum` 实际是 KO 编号，也不改字段名。
    """

    ad, nc = group_frames(df, species_cols)
    ad_mean = ad.mean(axis=0)
    nc_mean = nc.mean(axis=0)

    if df.attrs.get("feature_kind") == "ko":
        # KO 没有 p__/g__/s__ 层级，直接取总丰度最高的 12 个 KO 做组成图。
        total = ad_mean + nc_mean
        ordered = total.sort_values(ascending=False).head(12).index.tolist()
        ad_total = float(ad_mean[ordered].sum()) or 1.0
        nc_total = float(nc_mean[ordered].sum()) or 1.0
        return [
            {
                "phylum": short_name(col),
                "adRatio": float(ad_mean[col] / ad_total),
                "ncRatio": float(nc_mean[col] / nc_total),
            }
            for col in ordered
        ]

    ad_sum: dict[str, float] = defaultdict(float)
    nc_sum: dict[str, float] = defaultdict(float)

    # 物种列名里带 p__ 层级；把每个物种的组均值累加到对应 phylum。
    for col in species_cols:
        phylum = get_level(col, "p") or "Unclassified"
        ad_sum[phylum] += float(ad_mean[col])
        nc_sum[phylum] += float(nc_mean[col])

    ad_total = sum(ad_sum.values()) or 1.0
    nc_total = sum(nc_sum.values()) or 1.0
    rows = [
        {
            "phylum": phylum.replace("_", " "),
            "adRatio": ad_sum.get(phylum, 0.0) / ad_total,
            "ncRatio": nc_sum.get(phylum, 0.0) / nc_total,
        }
        for phylum in sorted(set(ad_sum) | set(nc_sum))
    ]
    rows.sort(key=lambda item: item["adRatio"] + item["ncRatio"], reverse=True)

    # 只保留前 6 个门，其余合并为 Other，避免组成图标签过密。
    if len(rows) <= 6:
        return rows

    top = rows[:6]
    other = {
        "phylum": "Other",
        "adRatio": sum(item["adRatio"] for item in rows[6:]),
        "ncRatio": sum(item["ncRatio"] for item in rows[6:]),
    }
    return [*top, other]
