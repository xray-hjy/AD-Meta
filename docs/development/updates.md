# AD-Meta 最新更新日志

> 最新开发说明见 [2026-07-14 开发更新日志](2026-07-14-development-update.md)；分类层级可视化版本说明见 [2026-07-12 更新日志](2026-07-12-release-notes.md)。

## 2026-07-14：项目定位与分析入口更新

- 将 AD-Meta 明确定位为面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具。
- 首页按群落物种、群落功能、物种-功能联合和 MAG 解析四个稳定分析域展示当前能力与扩展方向。
- 首页补充从 Raw FASTQ、共同预处理到物种、KO 和 MAG 三条分析分支的完整技术路线。
- 统一“分析数据”“分析矩阵”和“结构化分析结果”等术语，避免将导入矩阵误称为研究数据集或数据产品。
- 新增生物信息分析流程与分析数据接入参考资料，并同步更新项目概览和首页文案。
- 前端 32 项测试全部通过，生产构建成功。

## 2026-07-12：项目文档与架构说明整理

- 新增 `docs/project-overview.md`，记录 AD/NC 肠道宏基因组研究背景、数据来源、当前生信流程进度和仓库边界。
- 新增 `docs/architecture.md`，明确后端预计算、统一分类层级树、图表 projection、前端骨架和后续扩展规则。
- 新增 `docs/README.md` 作为统一文档索引。
- 将运行手册归入 `docs/guides/`，API 与数据库契约归入 `docs/reference/`，本轮更新和调查记录归入 `docs/development/`。
- 删除旧版前端直读 Excel 的历史参考，避免后续开发误用已经废弃的架构。
- 补充 Windows PowerShell 启动命令，并把正式分类层级接口更新为 `taxonomy` 与 `taxonomy_sankey`。
- 新增 `docs/development/taxonomy-visualization-development.md`，系统记录旭日图、矩形树图、桑基图和放射树图的数据、交互、标签与响应式优化。

## 2026-07-03：后端图表计算模块拆分

- 将 `backend/app/compute/precompute.py` 从集中式主计算文件拆分为轻量调度器。
- 新增 `backend/app/compute/charts/`，按图表类型维护丰度对比、组成图、箱线图、热图、KO 检出率、KO LDA、旭日图、PCA/PCoA 和 summary 计算逻辑。
- 新增 `common.py`、`io.py`、`table.py`，分别承载共享常量、读写/JSON 序列化、输入表标准化。
- `taxonomy.py` 继续作为共享分类名称处理工具，保留 `get_level`、`short_name`、`taxonomy_chain`，不按图表重复拆分。
- `precompute.py` 保留原有函数名导出，兼容现有导入路径；HTTP API、缓存 JSON 字段、数据库结构和前端调用方式不变。
- 本次为纯内部重构，不提升 `COMPUTE_VERSION`，现有缓存不需要强制重建。

## 2026-06-15：AD/NC 合并聚类热图

- 保留原有 AD、NC 和差异热图，在两个分组热图下新增一张 AD/NC 全样本合并热图。
- 合并热图对全部样本共同执行 Euclidean distance + average linkage 层次聚类，允许 AD/NC 样本交叉排列。
- 合并图底部显示差异物种聚类树，右侧显示样本聚类树，并用红色 AD、绿色 NC 分组条标识每一行。
- `heatmap` 缓存新增 `combinedRowOrder` 和行列 `dendrograms` linkage 数据；前端复用原矩阵，不重复传输完整丰度数据。
- 合并图继续支持悬停详情、点击放大、缩放和 PNG 导出；旧缓存缺少树数据时保留原三张图并提示重新预计算。
- `COMPUTE_VERSION` 提升为 `2026-06-15-v2`，物种数据需要重新导入以生成新缓存。

## 对比基准

- 生成时间：2026-06-05 17:31:36（Asia/Shanghai）
- 远程仓库：`git@github.com:xray-hjy/AD-Meta.git`
- GitHub `main` 基准提交：`66871269300d6927c603ad801c4498572b8fe3ce`
- 基准版本说明：`feat: improve heatmap performance and composition summaries`
- 当前本地状态：基于 GitHub 最新 `main`，包含尚未推送的 KO LDA 展示优化、分类组成图交互增强、导入兼容修复和文档整理。
- 数据策略：真实数据、缓存和 SQLite 数据库仍保存在 `backend/storage`，继续被 `.gitignore` 排除，不上传到 GitHub。

## 核心功能更新

- KO LDA 图从全局 Top 30 改为显著性优先的分组平衡展示：AD 显著 KO 最多 15 个，NC 显著 KO 最多 15 个。
- KO LDA 图改为左右发散柱状图：NC 富集向左，AD 富集向右；tooltip 和标签仍显示正数 LDA 值。
- LDA payload 新增 `filter.selectionMode/perGroupTopN` 和 `summary`，用于解释显著 KO 总数、AD/NC 富集数量和当前展示数量。
- 分类旭日图新增右上角 `切换` 按钮，可在旭日图和矩形树图之间切换，并使用 ECharts `universalTransition` 实现平滑过渡。
- 旭日图保留圆角扇区、明亮分类色板和智能标签；矩形树图增加极细白色边框、顶部避让标题、hover 闪烁收敛处理。
- 导入命令支持从已有 `backend/storage/raw/.../raw.csv` 原位重新预计算，避免源文件和目标 raw 文件相同时触发 `SameFileError`。

## 前端更新

- `KoLdaBarChart` 增加旧 payload 回退逻辑：如果后端缓存没有 `summary`，前端会从 `items` 计算展示数量。
- `SunburstChart` 现在同时支持 `sunburst` 和 `treemap` 两种视图，共用同一份层级数据和同一个 ECharts series id。
- 矩形树图配置为 `roam: false`、`nodeClick: undefined`、`breadcrumb.show: false`，保持只读展示。
- 为减少矩形树图右下角 hover 闪烁，`universalTransition` 只在点击切换后的短时间内开启，tooltip 设置为不拦截鼠标事件。

## 后端与 API 更新

- `compute_ko_lda` 先计算所有 `p < 0.05` 的显著 KO，再按 AD/NC 分组排序并各取最多 15 个。
- AD/NC 组内排序规则保持为 `ldaScore desc -> pValue asc -> koId asc`；任一组不足 15 个时不使用不显著 KO 或另一组额外 KO 凑数。
- `docs/reference/api.md` 新增 `/api/datasets/{slug}/charts/lda` 契约，说明分组平衡选择、summary 字段和 items 字段。
- `import_dataset` 增加同文件保护，当导入源已经是目标 raw 文件时跳过 copy，直接重新预计算。

## 文档更新

- 新增 `README.md`，作为项目文档入口，说明当前架构、主要文档和数据分发方式。
- 旧版前端直读 Excel 的历史参考已在文档重组中移除，当前开发以 React、API 和预计算缓存架构为准。
- 更新日志默认以 GitHub 当前最新 `main` 为基准，记录本地待推送版本相对远程的新增变化。

## 测试与验证

- 新增/更新后端测试覆盖：
  - KO LDA 按 AD/NC 分组各取最多 15 个。
  - AD 组不足 15 个时不回填不显著 KO 或额外 NC KO。
  - LDA `filter` 与 `summary` 字段正确。
  - 从已有 raw 文件原位重新导入不会触发 `SameFileError`。
- 新增/更新前端测试覆盖：
  - AD LDA 柱为正值，NC LDA 柱为负值。
  - LDA 摘要条显示显著 KO、AD/NC 富集数和当前展示数。
  - 旧 LDA payload 缺少 `summary` 时仍可回退渲染。
- 本次推送前固定验证命令：
  - `cd backend && .venv/bin/python -m unittest tests.test_precompute tests.test_dataset_service tests.test_heatmap_api tests.test_import_dataset -v`
  - `CI=1 npm --prefix frontend test -- --runInBand --watch=false`
  - `npm --prefix frontend run build`

## 数据与协作说明

- 本地已重新预计算 `ad-nc-ko-abundance` 的 LDA 缓存，当前缓存展示结果为 `AD 7 + NC 15`。
- `backend/storage` 仍被 `.gitignore` 排除，重新生成的缓存、SQLite 数据库和原始数据不会进入 GitHub。
- 同事需要查看同样数据效果时，继续通过硬盘拷贝整个 `backend/storage` 目录。

## 注意事项

- 本次推送包含源码、测试和文档，不包含真实数据、缓存、构建产物或依赖目录。
- 推送前需确认 `backend/storage`、`frontend/build`、`frontend/node_modules`、`backend/.venv`、`__pycache__` 和 `.DS_Store` 没有进入暂存区。
