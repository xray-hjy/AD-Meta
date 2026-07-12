"""按图表类型拆分的预计算函数。

每个模块对应前端一个或一组图表：
- species/phylum/boxplot/heatmap/detection/lda/taxonomy_hierarchy/ordination/summary

这些函数都接收已经标准化后的 DataFrame 和 feature 列名列表，返回可以
写入 `backend/storage/cache/<dataset>/<chart>.json` 的 Python dict/list。
"""
