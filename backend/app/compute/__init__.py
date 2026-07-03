"""公共数据集图表预计算包。

这个包只负责把原始宽表数据转换成前端可以直接渲染的 JSON payload。
对外入口仍然是 `app.compute.precompute`，具体图表算法拆在
`app.compute.charts` 下，便于以后单独修改某一类图表。
"""
