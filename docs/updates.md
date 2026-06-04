# AD-Meta 最新更新日志

## 对比基准

- 生成时间：2026-06-05 00:10:18（Asia/Shanghai）
- 远程仓库：`git@github.com:xray-hjy/AD-Meta.git`
- GitHub `main` 基准提交：`aed7d86cb03c760f16a0baf8194ee0c3a52ce2dc`
- 当前本地 `HEAD`：`aed7d86cb03c760f16a0baf8194ee0c3a52ce2dc`
- 对比方式：临时克隆 GitHub `main` 后，与当前本地工作区做净化快照对比。
- 差异统计：排除 `.git`、依赖、构建产物、缓存、原始数据和 Python 缓存后，共 `31 files changed, 3382 insertions(+), 216 deletions(-)`。

> 说明：本地 `HEAD` 与远程 `main` 提交号相同，但本地工作区包含大量未提交的新功能和文档改动；因此 GitHub 当前代码仍是旧版。

## 核心功能更新

- 新增 KO 数据集识别与展示逻辑，支持从 `K00001` 这类 KO ID 列识别功能丰度数据，并在摘要中区分 `featureKind: taxonomy` 与 `featureKind: ko`。
- KO 页面改为只保留核心图表：`丰度对比`、`KO 功能组成`、`KO 检出率热图`、`KO 功能 LDA 值柱状图`。
- 新增 `KO 检出率热图`，按 `abundance > 0` 计算 AD/NC 检出样本数和检出率，并按 AD/NC 检出率差异优先排序。
- 新增 `KO 功能 LDA 值柱状图`，先用 Mann-Whitney U 筛选显著差异 KO，再基于 `log10(abundance + 1)` 做单特征 LDA，展示 Top 30 KO。
- 删除 KO 页面中的箱线图、旭日图、PCA、PCoA 和丰度热图入口，避免把 taxonomy 图表误用于 KO 数据。
- 增强物种丰度箱线图：默认使用 `log10(丰度 + 1)`，支持切换原始丰度，并展示 AD/NC 离群点散点。
- 丰度热图增强为差异物种聚类分析，加入差异筛选、层次聚类列排序、导出和更清晰的差异色阶说明。

## 后端更新

- `precompute` 支持 taxonomy 与 KO 两类特征，并统一输出 `featureLabel`、`featureKind`、`totalFeatures` 等元数据。
- 新增公开 chart 类型 `detection` 和 `lda`；对应接口沿用 `/api/datasets/{slug}/charts/{chartType}` 的缓存读取方式。
- KO artifact 生成规则调整为 `summary/species/phylum/detection/lda`；taxonomy 数据集继续生成箱线图、热图、旭日图、PCA、PCoA 等图表。
- 物种箱线图后端 payload 保留 `adBox/ncBox`，并新增 `adOutliers/ncOutliers/adLogBox/ncLogBox/adLogOutliers/ncLogOutliers`。
- 箱线图 whisker 口径修正为 1.5 IQR 范围内的最近真实样本值，离群点为超出该范围的真实样本值。
- 导入流程新增标准化长表写入：taxonomy 数据写入 `sample_info/taxon_anno/species_abundance`，KO 数据写入 `sample_info/ko_anno/ko_abundance`。
- 数据库层增强 SQLite/MySQL 兼容，新增 feature metadata、KO 表、科学分析表、引用样本/标志物相关表，并更新 chart artifact 读取兼容逻辑。
- 数据集读取服务新增 `featureKind/featureLabel/availableCharts` 输出，前端可据此决定展示哪些图表。

## 前端更新

- 侧边栏 tab 根据 `featureKind` 动态展示：taxonomy 保留物种分析图，KO 仅展示 KO 专用图表。
- 新增 `DetectionHeatmap` 组件，基于 ECharts category heatmap 展示 AD/NC 两行检出率，tooltip 显示检出样本数、检出率和 rate gap。
- 新增 `KoLdaBarChart` 组件，以横向柱状图展示显著差异 KO 的 LDA score，并用 AD 红色系、NC 绿色系区分富集组。
- `BoxPlot` 新增尺度切换按钮，默认 `log10(丰度 + 1)`，可切回原始丰度；同时叠加 `AD 离群点` 与 `NC 离群点` scatter series。
- `BarChart`、`StatsCards`、PCA/PCoA、Sunburst 等组件补充 feature-aware 文案，避免 KO 数据仍显示“物种”或 taxonomy 口径。
- `Heatmap` 加强差异物种展示，支持基于筛选结果的列排序、可读标签、差异矩阵和导出说明。

## 测试与验证

- 新增后端测试覆盖：
  - KO 数据准备、二元 label 映射、KO summary metadata。
  - KO 检出率热图计数、检出率、排序和 KO/taxonomy artifact 分流。
  - KO LDA 显著性筛选、LDA score、富集方向、排序 tie-breaker。
  - 箱线图真实 whisker、原始/对数离群点 payload。
  - 数据集 chart cache 读取、API `/charts/detection` 与 `/charts/lda`。
  - 标准化导入写入 taxonomy/KO 长表。
- 新增前端测试覆盖：
  - KO 页面只显示 4 个 KO 图表，taxonomy 页面不显示 KO LDA tab。
  - `DetectionHeatmap` 的摘要、色阶、矩阵数据和 ECharts heatmap option。
  - `KoLdaBarChart` 的摘要、AD/NC 富集色彩、tooltip 和 bar series。
  - `BoxPlot` 默认对数尺度、原始丰度切换、boxplot + scatter series。
  - `Heatmap` 层次列排序展示。
- 最近一次本地验证记录：
  - `cd backend && .venv/bin/python -m unittest tests.test_precompute tests.test_dataset_service tests.test_heatmap_api -v`：22 tests OK。
  - `cd frontend && CI=1 npm test -- --runInBand --watch=false`：5 suites / 9 tests passed。
  - `npm --prefix frontend run build`：Compiled successfully。

## 文档更新

- `docs/api.md` 补充 `featureKind/featureLabel/featureCount/availableCharts` 等接口字段，并说明 chart endpoint 契约。
- `docs/runbook.md` 补充本地开发、导入数据、SQLite/MySQL 模式、标准化长表写入和 Docker 运行说明。
- 新增 `docs/database.md`，记录核心科学表、应用支撑表和导入规则。

## 注意事项

- 当前 GitHub `main` 仍是旧版代码；本日志描述的是当前本地工作区相对远程 `main` 的未提交更新。
- 本地存在较多未提交文件和修改，推送前建议先分批 review，尤其是后端数据库迁移/兼容逻辑和前端图表 payload 契约。
- 对比快照已排除依赖目录、构建产物、运行缓存、原始数据和解释器缓存，日志仅统计源码、测试和文档变化。
