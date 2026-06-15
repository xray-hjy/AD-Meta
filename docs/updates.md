# AD-Meta 最新更新日志

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
- `docs/api.md` 新增 `/api/datasets/{slug}/charts/lda` 契约，说明分组平衡选择、summary 字段和 items 字段。
- `import_dataset` 增加同文件保护，当导入源已经是目标 raw 文件时跳过 copy，直接重新预计算。

## 文档更新

- 新增 `README.md`，作为项目文档入口，说明当前架构、主要文档和数据分发方式。
- `docs/code-reference.md` 重命名为 `docs/legacy-frontend-code-reference.md`，标注为旧版前端直读 Excel 的历史参考，不作为当前开发依据。
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
