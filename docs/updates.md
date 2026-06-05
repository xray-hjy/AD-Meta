# AD-Meta 最新更新日志

## 对比基准

- 生成时间：2026-06-05 15:50:45（Asia/Shanghai）
- 远程仓库：`git@github.com:xray-hjy/AD-Meta.git`
- GitHub `main` 基准提交：`9764c3bd8648556fb6a4f778733059d755b8ce67`
- 基准版本说明：`feat: add KO analytics and chart updates`
- 当前本地状态：基于 GitHub 最新 `main`，包含尚未推送的前端性能优化、组成图卡片和测试更新。
- 数据策略：真实数据、缓存和 SQLite 数据库仍保存在 `backend/storage`，继续被 `.gitignore` 排除，不上传到 GitHub。

## 核心功能更新

- 物种丰度热图由大量 SVG 单元格重构为 Canvas 绘制，显著减少 DOM 节点数量，改善点击放大、拖拽和缩放时的卡顿。
- 热图放大预览改为 Canvas 高清快照生成的图片，不再复制大型 SVG DOM；导出图片继续使用 Canvas 输出 PNG。
- 热图预览滚轮缩放改为鼠标指针锚点缩放，鼠标停在哪里就围绕哪里放大或缩小，交互更接近地图/图片查看器。
- `门级组成` 和 `KO 功能组成` 增加图表顶部摘要卡片，展示当前项数、AD 最高、NC 最高和最大组间差异。
- 组成图卡片复用现有 `phylum` payload，不改后端接口、不改缓存结构，taxonomy 与 KO 数据集都能适配。

## 前端更新

- `Heatmap` 保留原有 AD/NC/diff 三图结构和颜色含义，但将主体渲染迁移到单个 Canvas 面板。
- 热图 tooltip 改为基于鼠标坐标反推当前行列，避免为每个单元格绑定 DOM 事件。
- 热图 lightbox 的拖拽和缩放使用 `requestAnimationFrame` 更新 transform，减少 React 重渲染压力。
- `PhylumChart` 新增 feature-aware 文案：taxonomy 显示 `门级组成概览`，KO 显示 `KO 功能组成概览`。
- `App` 在渲染组成图时向 `PhylumChart` 传入 `featureKind` 和 `featureLabel`，用于区分 KO 与 taxonomy 文案。

## 测试与验证

- 新增 `PhylumChart` 测试，覆盖 taxonomy/KO 两类组成图摘要卡片、AD/NC 最高项和最大组间差异方向。
- 更新 `App` 测试，验证 KO 组成图能收到 `featureKind: ko` 和 `featureLabel: KO`。
- 更新 `Heatmap` 测试，覆盖 Canvas 渲染、tooltip 命中、图片 lightbox、按钮缩放、重置和鼠标锚点滚轮缩放。
- 本次推送前固定验证命令：
  - `CI=1 npm --prefix frontend test -- --runInBand --watch=false`
  - `npm --prefix frontend run build`

## 数据与协作说明

- GitHub 仓库只保存源码、测试和文档，不保存真实实验数据。
- 需要让同事看到同样效果时，请通过硬盘单独拷贝整个 `backend/storage` 目录。
- 当前本地 `backend/storage` 包含 `ad_meta.sqlite3`、`raw/` 原始数据和 `cache/` 图表缓存；这些文件均被 `.gitignore` 排除。
- 同事 clone 项目后，将 `backend/storage` 放回同一路径即可复用当前数据集和图表缓存。

## 注意事项

- 本次更新只涉及前端图表性能、组成图摘要卡片、相关测试和更新日志。
- KO 分析、检出率热图、LDA 图、箱线图增强等功能已包含在 GitHub 当前基准提交 `9764c3b` 中，本日志不再重复记录旧版本差异。
- 推送前需确认 `backend/storage`、依赖目录、构建产物和 Python 缓存没有进入暂存区。
