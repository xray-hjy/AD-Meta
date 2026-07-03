"""丰度对比图数据计算。

对应前端“丰度对比”柱状图，输出 AD/NC 两组在 Top N 特征上的均值、
标准差和总丰度。虽然函数名叫 `compute_species`，KO 数据集也复用它来
生成 Top KO 丰度对比。
"""

from __future__ import annotations

import pandas as pd

from app.compute.common import FEATURE_META, group_frames
from app.compute.taxonomy import short_name


def compute_species(df: pd.DataFrame, species_cols: list[str], top_n: int = 50) -> list[dict]:
    """计算 Top N 特征的 AD/NC 平均丰度对比。

    排序规则是 `AD mean + NC mean` 从高到低。返回列表中的每一项都会直接
    写入 `species.json`，供前端柱状图读取。
    """

    ad, nc = group_frames(df, species_cols)

    # 分别计算两组的均值和标准差，前端用 mean 画柱，用 std 画误差线。
    ad_mean = ad.mean(axis=0)
    nc_mean = nc.mean(axis=0)
    ad_std = ad.std(axis=0, ddof=1).fillna(0)
    nc_std = nc.std(axis=0, ddof=1).fillna(0)
    total = ad_mean + nc_mean

    # 用两组均值之和表示总体丰度，选出最值得展示的 Top N。
    ordered = total.sort_values(ascending=False).head(top_n).index
    return [
        {
            "species": short_name(col),
            "feature": short_name(col),
            "fullName": col,
            "featureLabel": df.attrs.get("feature_label", FEATURE_META["taxonomy"]["label"]),
            "adMean": float(ad_mean[col]),
            "adStd": float(ad_std[col]),
            "ncMean": float(nc_mean[col]),
            "ncStd": float(nc_std[col]),
            "total": float(total[col]),
        }
        for col in ordered
    ]
