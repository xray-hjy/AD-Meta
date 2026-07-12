"""图表预计算总调度入口。

这个文件故意保持很薄：
- 从 `table.py` 读取并标准化原始数据。
- 调用 `charts/` 下各图表模块生成 payload。
- 继续 re-export 旧函数名，兼容历史测试和导入路径。

真正的图表算法不要继续加在这里；修改某个图表时优先去对应的
`backend/app/compute/charts/*.py` 文件。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .charts.boxplot import _box_summary, _box_values, compute_boxplot
from .charts.detection import compute_detection_heatmap
from .charts.heatmap import _cluster_order, _heatmap_filter, _hierarchical_cluster, compute_heatmap
from .charts.lda import _univariate_lda_score, compute_ko_lda
from .charts.ordination import _confidence_ellipses, _permanova, compute_pca, compute_pcoa
from .charts.phylum import compute_phylum
from .charts.species import compute_species
from .charts.summary import compute_summary
from .charts.taxonomy import (
    TAXONOMY_TREE_PRUNE_RULES,
    _sum_tree_values,
    compute_sunburst,
    compute_taxonomy_hierarchy,
    compute_taxonomy_sankey_projection,
    compute_taxonomy_tree,
)
from .common import AD, NC, FEATURE_META, KO_RE, group_frames
from .io import jsonable as _jsonable
from .io import read_table, write_json
from .table import prepare_dataframe


def _group_frames(*args, **kwargs):
    """兼容旧导入路径的分组函数别名。

    新代码应优先从 `app.compute.common import group_frames` 导入。
    """

    return group_frames(*args, **kwargs)


def precompute_all(path: Path, slug: str, name: str, published_at: str) -> tuple[dict, dict[str, Any], list[str]]:
    """为一个数据集生成所有需要缓存的图表 payload。

    Args:
        path: 原始数据文件路径，支持 xlsx/csv/tsv。
        slug: 数据集唯一标识，用于 summary 和缓存目录。
        name: 数据集展示名称。
        published_at: 本次导入/发布的时间戳。

    Returns:
        summary: 数据集概览 payload，同时也会写成 `summary.json`。
        artifacts: `{chart_type: payload}`，导入流程会逐个写入缓存 JSON。
        warnings: 标准化输入表时产生的非阻断提示。
    """

    df, species_cols, warnings = prepare_dataframe(path)
    summary = compute_summary(df, species_cols, slug, name, published_at)

    # summary/species/phylum 是物种和 KO 数据集都会生成的基础图表。
    artifacts = {
        "summary": summary,
        "species": compute_species(df, species_cols),
        "phylum": compute_phylum(df, species_cols),
    }

    # KO 数据集只生成 KO 专属图；物种数据集生成分类、排序和多样性图。
    if summary.get("featureKind") == "ko":
        artifacts["detection"] = compute_detection_heatmap(df, species_cols)
        artifacts["lda"] = compute_ko_lda(df, species_cols)
    else:
        artifacts["boxplot"] = compute_boxplot(df, species_cols)
        taxonomy_hierarchy = compute_taxonomy_hierarchy(df, species_cols)
        artifacts["taxonomy"] = taxonomy_hierarchy
        artifacts["sunburst"] = taxonomy_hierarchy
        artifacts["taxonomy_sankey"] = compute_taxonomy_sankey_projection(taxonomy_hierarchy)
        artifacts["pca"] = compute_pca(df, species_cols)
        artifacts["pcoa"] = compute_pcoa(df, species_cols)
        artifacts["heatmap"] = compute_heatmap(df, species_cols)
    return summary, artifacts, warnings


__all__ = [
    "AD",
    "NC",
    "KO_RE",
    "FEATURE_META",
    "TAXONOMY_TREE_PRUNE_RULES",
    "_box_summary",
    "_box_values",
    "_cluster_order",
    "_confidence_ellipses",
    "_group_frames",
    "_heatmap_filter",
    "_hierarchical_cluster",
    "_jsonable",
    "_permanova",
    "_sum_tree_values",
    "_univariate_lda_score",
    "compute_boxplot",
    "compute_detection_heatmap",
    "compute_heatmap",
    "compute_ko_lda",
    "compute_pca",
    "compute_pcoa",
    "compute_phylum",
    "compute_species",
    "compute_summary",
    "compute_sunburst",
    "compute_taxonomy_hierarchy",
    "compute_taxonomy_sankey_projection",
    "compute_taxonomy_tree",
    "precompute_all",
    "prepare_dataframe",
    "read_table",
    "write_json",
]
