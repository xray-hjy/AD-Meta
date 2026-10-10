# AD-Meta 开发交接文档｜2026-10-08

> 用途：结束本轮聊天后，把本文交给新的开发聊天。新开发者应能据此找到代码、理解数据与科研口径、继续开发，并避免重新引入已修复的问题。
>
> 本文是当前状态快照和经验总结。代码、真实数据、当前用户要求及根目录 `AGENTS.md` 优先；历史开发记录用于理解决策，不应当作必须逐条执行的命令。

## 1. 新聊天先读这一页

### 1.1 当前落点

| 项目 | 当前状态 |
| --- | --- |
| 项目 | AD-Meta；面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具 |
| 本机工作目录 | `G:\project\admeta` |
| 仓库 | <https://github.com/xray-hjy/AD-Meta> |
| 当前开发分支 | `codex/20261008-update` |
| 最近已推送代码提交 | `49750bbf78809e037cfb6e4167a9ed6595c796a9` |
| 提交说明 | `feat: 20261008更新 - MAG、物种与KO可视化和交互优化` |
| 本轮对比基线 | main 的 `f0d583a4dc072939f06bbf761e52b2da8c64c77e` |
| 发布范围 | 上述更新分支已推送；本聊天未合并到 main、未创建 PR |
| 更新说明 | README 的“20261008更新”及 `docs/development/20261008-update.md` |
| 本文状态 | 推送代码之后新增的本地交接文档，不能把它误认为已包含在 `49750bb` 中 |

**开工前重新执行 `git status --short`、`git branch --show-current` 和 `git log -3 --oneline`。** 后续聊天可能改变工作区；不要仅依据本文回滚、覆盖或切回 main。

### 1.2 当前已经完成的主线

1. MAG 工作区整体布局、处理流程、数据说明、独立折叠、列表与图表控件已优化。
2. MAG 丰度图采用经过适配的 ECharts 原生条形 / 柱形 / 折线组件，保留连续导航、摇杆、预览、双轴拖动、科研样式和导出。
3. 物种和 KO 的适用条形图已接入共享组件；不能把不同视图的数值尺度强行统一。
4. 查询输入框已增加自动补全；普通下拉菜单和 Top N 面板已统一主题与交互。
5. MAG 热图已支持完整矩阵导航、筛选、聚类、真实树状图、轴交换和方法说明。
6. 已修复热图导出时标签和树状图缩小到不可读的问题。
7. 研究拓展模块已建立真实状态模板；功能注释、覆盖证据、稳健性和独立队列验证没有被伪装成完成结果。

### 1.3 新聊天最重要的约束

- 先理解已有实现，再做有针对性的扩展；用户不希望把成熟组件整体重写。
- 可视化优化不能改写原始丰度、统计检验族、效应量、样本范围或数据缺失语义。
- 图表选取、列表分页、科学筛选和图形样式是不同状态层。
- 常规调整无需反复询问确认；用户要求先讨论的事项则先讨论。
- 不以模拟图、猜测的参数或缺失注释填充研究结果。
- 修改后验证实际交互与实际导出；“配置写了动画 / SVG”不等于真实效果正确。

## 2. 项目背景与资料优先级

根目录 `AGENTS.md` 规定：需要补充背景时按问题查阅以下资料，而不是靠聊天记忆概括。

| 问题 | 优先资料 |
| --- | --- |
| 项目定位、用户、术语和对外边界 | `doc/微脑智库_商业计划书_agent阅读版.md` |
| 原始章节、表格和完整计划书 | `doc/微脑智库_商业计划书_结构化版.md` |
| 数据来源、生信流程、工具、产物语义 | `doc/AD宏基因组生物信息分析流程_agent阅读版.md` |
| 当前系统与稳定接口 | `docs/architecture.md`、`docs/reference/api.md`、`docs/reference/database.md` |
| 当前交付产物和来源缺项 | `docs/guides/data-products-and-provenance.md`、`docs/guides/server-transfer-audit.md` |

项目输出用于研究辅助。候选差异、关联和 AI 线索不能未经证据升级为临床诊断、已验证生物标志物或因果结论。

生信分析与网页系统各有职责：Raw FASTQ 的质控、去宿主、组装、分箱、注释、定量在上游完成；网页主要接入交付结果、校验身份、计算可解释统计、提供交互与来源追溯。不要在日常页面请求中临时运行上游生信脚本或读取整个源结果目录。

## 3. 技术栈与运行方式

### 3.1 技术栈

| 层 | 主要实现 |
| --- | --- |
| 前端 | React 19、Vite 6、React Router、TanStack Query |
| 绘图 | ECharts 6.1、SVG、D3 相机 / 色阶工具 |
| 交互控件 | Base UI 1.8、Radix Slider |
| 后端 | FastAPI、Pydantic、NumPy、SciPy |
| 持久化 | MySQL、Alembic；版本化数据集与 MAG 关系表 |
| 统计 worker | R / Bioconductor；ANCOM-BC2、MaAsLin2 |
| 验证 | Vitest、Testing Library、pytest、Ruff、mypy、TypeScript、Playwright |

版本应以 `frontend/package-lock.json` 和后端依赖文件为准，不因本文提到某版本就擅自升级依赖。

### 3.2 本机环境与新克隆环境要分开

本机已有后端虚拟环境、前端依赖、MySQL、MAG 数据包和本地运行记录。

- Python：`backend/.venv/Scripts/python.exe`。
- Node 要求：22 或更新版本。
- 当前聊天曾使用 Codex 自带 Node：`C:/Users/xdcai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`；它是本机工具路径，不是项目部署要求。
- 本地 `.env` 存放数据库连接及 MAG 配置，被 Git 忽略。不要把密码写入交接文档或提交。
- 本机设置记录：`LOCAL_SETUP.md`，也被 Git 忽略，**新克隆不一定有此文件**。
- 完整 MAG 包位于本机 `ADMetaData/development_input/mag_v3/`，不在代码仓库内。

新克隆按 `docs/guides/runbook.md` 安装依赖和准备数据库；不能认为拉取 Git 仓库就已取得完整 MAG 数据与运行环境。

### 3.3 启动命令

项目根目录，分别使用三个终端：

```powershell
Set-Location -LiteralPath G:\project\admeta
.\Start-ADMeta.ps1 backend
```

```powershell
Set-Location -LiteralPath G:\project\admeta
.\Start-ADMeta.ps1 frontend
```

```powershell
Set-Location -LiteralPath G:\project\admeta
.\Start-ADMeta.ps1 worker
```

也可使用根目录 `npm run dev:backend`、`npm run dev:frontend`；worker 按运行手册在 `stats-worker` 中执行 `Rscript server.R`。

| 服务 | 地址 |
| --- | --- |
| 前端 | `http://127.0.0.1:3000` |
| 后端 | `http://127.0.0.1:8000` |
| API 文档 | `http://127.0.0.1:8000/docs` |
| 统计 worker | `http://127.0.0.1:8001` |
| Vite 构建预览 | `http://127.0.0.1:4173` |

Vite 开发代理 `/api` 到后端；配置见 `frontend/vite.config.js`。

`scripts/backend-python.mjs` 自动选取项目虚拟环境，并把 Python 子进程 cwd 设为 `backend`。因此以下命令从根目录执行，但 Python 参数中的文件路径需考虑 backend cwd：

```powershell
node scripts/backend-python.mjs -m app.cli.validate_mag
```

**交接时的即时检查：8000 连接被拒绝，后端没有处于可访问状态。** 此前功能验证成功是历史事实，不代表当前所有服务仍在运行。新聊天先检查进程和端口；不要把连接拒绝直接当成 API 回归，也不要无故结束其他任务的服务。

## 4. 数据现状与科学口径

### 4.1 当前工作数据

| 数据 | 当前已验证规模 / 状态 |
| --- | --- |
| 当前分析样本 | 185 个 CRR 样本；AD 122，NC 63 |
| 群落物种 | 9,819 个发布特征；源表有一个重复列，经规则核对后合并 |
| 群落 KO | 2,258 个特征，属于样本 × KO 数据 |
| MAG v3 | 872 个代表 MAG；185 × 872 = 161,320 条丰度记录 |
| MAG 来源 | 8,548 个唯一成员 MAG，关联到代表 / 聚类与样本 |
| 上游处理流程 | 9,133 个评估 bins → 8,548 个质量筛选后 bins → 872 个代表 MAG |
| MAG 质量参考区间 | 当前绑定的 v3 处理资料记录 666 个代表位于完整度 ≥90%、污染率 ≤5% 区间 |
| 特殊 ANI 记录 | 24 条实际 ANI <0.95；保留原值及方向，不自动修正成阈值 |

本机此前已选择 `mag_v3` 和 database 存储。代码默认值及旧文档仍可能是 `mag_v2`；重新启动后以本机配置和 API `provenance.version / storageBackend` 为准。

流程数字来自版本绑定的资料，不能因为样本筛选改变，就让上游 bins / 代表 MAG 目录数量随之变化。`magProcessingProfiles.js` 用 manifest SHA-256、version、MAG 数量绑定资料；不要给新版本硬套旧流程数字。

### 4.2 必须保留的 MAG 口径

- 丰度是 CoverM 原始百分比；不将 872 个 MAG 再闭合到 100%。
- 疾病分组取 `disease`；`Group` 表示来源组，不能用 CHN / CHN2 代替 AD / NC。
- 超过阈值使用严格 `>`，不是 `>=`。人为丰度阈值不是生物学检出限。
- 当前版本丰度全部大于零，阈值 0 时比例为 100%；这不证明每个 MAG 都有足够覆盖或 reads 支持。
- 组间检验为双侧 Mann–Whitney U，包含既有并列秩 / 连续性校正口径；BH-FDR 对当前样本范围内全部 872 个代表 MAG 计算，再搜索、排序和截取。
- Top N、热图选行、候选列表分页不能重定义 BH 检验族。
- AD−NC 均值差是百分点；rank-biserial 效应正值表示 AD 倾向更高，不能把它称为倍数变化。
- 任一组样本不足时，检验与效应量按接口返回 null；浏览单组不等于可以伪造双组检验。
- 年龄、性别和批次筛选不是协变量校正；当前关联仍应按探索性结果解释。
- 完整度 ≥90%、污染率 ≤5% 是质量参考区间，不等于完成 MIMAG 全部高质量标准核验。
- 缺失值、真实零值、恒定特征是不同语义；不要为了图形漂亮互相替换。

### 4.3 群落与 MAG 数据不能混淆

- 群落物种 / KO 的上游丰度尺度与标准化方法仍有待补充来源，界面保持“未提供 / unknown”，不猜测为 TPM 或百分比。
- 门级组成、KO 相对贡献可能使用比例模型；显示百分比时保留本视图自身分母和转换。
- `KoLdaBarChart.jsx` 是历史文件名，**当前代码绘制的是带方向的 rank-biserial effect，不应在交接或 UI 中因为文件名就写成 LDA**。
- 样本 × KO 已交付不代表 MAG × KO 已交付；不能凭同名功能推导 MAG 携带哪些基因。
- GTDB 分类定位资料与独立系统发育树是不同证据；层次聚类热图的树也不是系统发育树。

### 4.4 本次物种 CSV 变更

原 main 受版本管理的 `raw.xlsx` 包含 373 个样本行；本次 `backend/storage/raw/ad-nc-species/raw.csv` 保留当前 185 个 CRR 样本。

推送前核对了同一远端 XLSX 与 CSV：1,817,255 个单元格值一致，CSV 是既有输入的子集。表头唯一变化是重复噬菌体列增加 `.1` 后缀；导入仍依据明确的重复列规则核对和合并。

这项验证不解决上游物种表生成链路的来源缺口。服务器 Bracken / Kraken 产物与该表有差异，尚不能把服务器表直接当作其原始生成结果。详细证据见 `docs/guides/server-transfer-audit.md`。

## 5. 代码导航：下一次从哪里改

### 5.1 工作区和业务视图

| 目标 | 入口 |
| --- | --- |
| 应用 / 路由 / 域切换 | `frontend/src/app/App.jsx`、`frontend/src/pages/analysis/AnalysisWorkspacePage.jsx` |
| 群落物种 / KO 工作区 | `frontend/src/pages/abundance/AbundanceWorkspacePage.jsx` |
| MAG 主工作区 | `frontend/src/pages/mag/MagWorkspacePage.jsx` |
| MAG 热图控制与说明 | `frontend/src/pages/mag/MagHeatmapWorkspace.jsx` |
| MAG 业务图表适配 | `frontend/src/pages/mag/MagCharts.jsx` |
| 分类 / 质量 / 技术质控 | `MagResearchChart.jsx`、`magResearchOptions.js`、`magResearchStyle.js` |
| MAG 来源、成员、crosswalk | `MagLineageView.jsx`、`MagDetailDrawer.jsx` |
| 单 MAG 候选浏览 / 结果列表 | `MagCatalogExplorer.jsx`、`MagFeatureTable.jsx` |
| 处理流程与绑定资料 | `MagProcessingFlow.jsx`、`magProcessingProfiles.js` |
| 待完成研究模板 | `MagResearchPlans.jsx` |

除表中给出完整路径的入口外，MAG 文件都位于 `frontend/src/pages/mag/`。

### 5.2 共享图表与交互

以下文件位于 `frontend/src/components/Charts/`：

| 文件 | 作用 |
| --- | --- |
| `ChartFrame.jsx` | 图表卡片、标题、控制区、加载 / 错误边界 |
| `ZoomableGroupedBarChart.jsx` | 完善的共享分组条形图；样式、导航、柱线模式、导出协调 |
| `NativeGroupedBarSurface.jsx` | ECharts 原生绘制、动作事件、视口同步、动画生命周期 |
| `groupedBarNativeOption.js` | 原生 series、轴、dataZoom、motion 配置 |
| `groupedBarScale.js` | 保留各业务尺度与值域语义 |
| `groupedBarMarkers.js` | 与数据位置对齐的分组注记 |
| `ZoomableChartViewport.jsx` | 共享相机、适应全图 / 宽度、平移与可见区间 |
| `chartCamera.js` | 相机几何与范围处理 |
| `ChartZoomControls.jsx` | 缩放工具 |
| `ChartPanJoystick.jsx`、`chartPanSpeed.js` | 摇杆与平移速度 |
| `ChartMinimap.jsx` | 全局预览和定位 |
| `chartLabel.js` | 字体测量、标签缩短和旋转空间处理 |
| `BoxScatterChart.jsx` | 共享箱线 / 样本散点绘制 |
| `ChartStyleToolbar.jsx`、`useChartStylePreferences.js` | 样式控制和偏好持久化 |
| `barStyle.js`、`boxStyle.js`、`PaletteSelect.jsx` | 图形专属样式与配色 |
| `ChartExportMenu.jsx`、`ChartImageExportSettings.jsx` | 导出浮层与格式 / 尺寸 / 倍率 / 默认设置 |
| `chartExport.js` | 独立导出实例、交互净化、SVG / PNG 下载 |

适配物种 / KO 时先看 `BarChart.jsx`、`PhylumChart.jsx`、`KoContributionChart.jsx`、`KoLdaBarChart.jsx`，通过 model 传入业务值、系列、单位、格式和权限；不要在共享组件中硬编码 MAG 单位。

### 5.3 查询、数量与表格

| 目标 | 文件 |
| --- | --- |
| 普通主题下拉 | `frontend/src/components/ui/StyledSelect.jsx`、`selection-controls.css` |
| 自动补全基础 | `EntityAutocomplete.jsx`、`entitySuggestions.js`、`entity-autocomplete.css`，同目录 |
| MAG 远程候选 / 手动清单 | `frontend/src/pages/mag/MagSearchInput.jsx` |
| 社区 Top N | `frontend/src/components/analysisScope/AnalysisTopNControl.jsx`、`TopNSettingsPanel.jsx` |
| MAG 丰度 Top N | `frontend/src/pages/mag/MagTopNSettings.jsx` |
| MAG 热图数量 | `frontend/src/pages/mag/MagHeatmapCountSettings.jsx` |
| MAG 工具栏浮层 | `frontend/src/pages/mag/MagToolbar.jsx` |
| 图表完整集合读取 | `frontend/src/pages/mag/magComparisonSelection.js` |
| 折叠数据区 | `frontend/src/components/data-display/CollapsibleResultSection.jsx`、`ResultDisclosure.jsx` |
| 表格高度 / 自动滚动 | `DataTableViewport.jsx`，同目录 |
| 客户端只读表 / 分页 | `ClientDataTable.jsx`、`PaginationControls.jsx`，同目录 |
| 完整结果查询 | `CompleteResultsPanel.jsx`，同目录 |

### 5.4 后端与契约

| 目标 | 文件 |
| --- | --- |
| MAG 路由与参数 | `backend/app/api/mag.py` |
| MAG response schema | `backend/app/api/mag_models.py` |
| MAG 数据加载 / 范围 / 统计 | `backend/app/services/mag_data_service.py` |
| MAG 关系数据库 | `backend/app/services/mag_database_service.py` |
| 热图选择、变换、聚类 | `backend/app/services/mag_heatmap_service.py` |
| 自动补全候选 | `backend/app/services/mag_suggestions.py` |
| 数据说明服务 | `backend/app/services/dataset_description_service.py` |
| 群落投影与范围 | `analysis_projection_service.py`、`chart_projection_service.py`，同目录 |
| 完整结果与审计 | `full_result_service.py`、`projection_audit_service.py`，同目录 |
| 受管输入登记 | `backend/storage_manifest.json` |
| OpenAPI | `backend/openapi.json` |
| 前端 API 调用 / 生成类型 | `frontend/src/api/mag.js`、`datasets.js`、`generated.ts` |

新增接口字段时同步后端 schema、OpenAPI、前端调用和生成类型，不能只在页面假定存在某字段。

## 6. 状态分层：避免交互反复重置

| 状态 | 修改后的预期 |
| --- | --- |
| 科学样本筛选 | 点击应用后改变数据范围；可能重算该范围的统计 |
| 排名 / Top N / 搜索 | 改变展示集合；不改变列表分页之外的科学定义 |
| 列表排序 / 页码 / 隐藏列 | 只影响列表，不重绘或替换图表集合 |
| 已选 MAG | 跨搜索、翻页和排序保持；用户明确选择才变更 |
| 绘图样式 | 配色、字号、网格等；不请求新科学计算 |
| 相机 | 缩放、平移、当前浏览区间；不裁掉后端矩阵 |
| 折叠 | 保留挂载与既有状态；首次展开才按需要初始化图表 |
| 弹层草稿 | 输入和滑条只改 draft；确认后再提交 |
| 导出设置 | 使用实际 applied 数据和样式，不读取尚未应用的草稿 |

加载下一页或新集合时，保留上次成功结果并提示加载，避免整个控制区被卸载。图、列表和候选请求错误应有各自的边界：列表失败不能隐藏已成功的图或所选 MAG 分布。

MAG API 单页有上限；`magComparisonSelection.js` 为全部集合按页读取。不要为了“一次加载全部”把服务端分页约束去掉。

## 7. 原生条形图：成熟实现的保留点

### 7.1 已有行为

- MAG 类别沿横轴排列时可切换折线；另一方向保留条形逻辑。业务禁止的切换由配置关闭，例如差异 KO 带方向效应图。
- 一个按钮切换柱线模式，当前图名和图标随状态更新。
- 共享图例、科研样式、原生 dataZoom 与外部相机联动。
- 普通页面滚轮用于页面滚动；Alt 配合图表缩放 / 拖动按已有规则生效。
- 分组标记、分组悬浮、相邻柱组分隔线分别控制。
- 用户明确要求分组识别区域在柱体 / 数据点；空白分类带不触发反复高亮。
- 高亮语义按实际系列 / 分组保持一致，不能只改变单个局部图形后忽略关联对象。

### 7.2 动画经验

- 默认入场为 1000 ms、`cubicInOut`，常规更新约 320 ms；可见对象超过 400 时简化动画。
- 保留稳定的 series ID 和数据 ID；普通更新使用合并模式。
- 柱线切换执行一次官方 `changeMagicType` action；不要紧接着重复 `setOption` 把动画取消。
- 柱体入场应从零基线生长。只给 `animation: true` 不足以保证这一点。
- 首次可见 / 展开后的容器测量和 resize 可能中断动画，要先确定真实尺寸。
- 关闭动画或系统减少动态效果时应立即完成，不能强制重放。
- 不在每个相机移动帧上传整个数据数组；通过短 dataZoom action 更新范围。
- 事件同步使用 silent / 帧合并避免原生缩放和外部相机之间的反馈循环。

以前曾逐帧读取实际柱体高度确认“从几像素长到完整高度”，不能把工具栏按钮淡入当作官方柱体动画已经实现。

### 7.3 拖动轴与布局

- 分类拖动条与绘图区共用 left / width；数值拖动条与绘图区共用 top / height。
- 保留 ECharts 原生圆角端点、选区拖动柄、轨道框选与数据阴影。
- 数值缩放使用 `filterMode: empty` 等既定语义，不因过滤而改变类别对应。
- 摇杆、全局预览和滑动条分别留出区域；窄屏用响应式位置避让。
- 图表尺寸变化、横纵轴交换、折线切换都要清理旧轴目标，不留下旧 dataZoom 索引。

## 8. 热图：算法、树状图与完整矩阵

### 8.1 选择与计算

默认展示 20 个 MAG。`topN=0` 在 MAG 语义中表示全部匹配；不能把该约定直接照搬给社区物种 / KO 接口。

| 模式 | 选行逻辑 |
| --- | --- |
| abundance | 所选样本平均丰度降序 |
| variance | `log10(1 + 丰度%)` 的总体标准差降序，排除零变异 |
| candidate / statistics | 已有 q 值和绝对秩效应条件，按 q 升序等规则排列 |
| candidate / manual | 完整 MAG ID 清单顺序；未知 ID 报错，空清单不自动填补 |

ID / 分类、质量、平均丰度和超过阈值比例等条件在展示截取前处理。变异排序与颜色模式是不同参数；后者不应偷偷改变候选定义。

### 8.2 聚类不是默认开启

默认样本按 AD/NC → 批次 → ID 排列，MAG 保留选行排序。它们是排序规则，不能称为已经聚类。

| 参数 | 值 | 解释 |
| --- | --- | --- |
| sampleOrder | group | 分组 / 批次 / ID 排列，不聚类 |
| sampleOrder | withinGroup | AD、NC 分别聚类，无跨组合并 |
| sampleOrder | cluster | 所有当前样本共同聚类 |
| rowOrder | rank | 保留已选 MAG 的排列 |
| rowOrder | cluster | 在当前样本范围内对所选 MAG 聚类 |

具体算法是 `scipy.cluster.hierarchy.linkage(method='average', metric='euclidean', optimal_ordering=False)`。使用 `leaves_list` 排列；输入为当前实际展示矩阵。

- 普通颜色：`log10(1 + abundance_percent)`。
- rowZ：每个 MAG 在所选样本中对上述 log 值做 Z-score，`ddof=0`；恒定列置 0 并记录。
- 不对零值补伪计数，不改变原始丰度。
- 修改 Top N、样本范围或颜色变换会改变聚类的输入；不能把新旧树当作对同一矩阵的固定结果。

### 8.3 树数据契约

```text
dendrograms
  metric: euclidean
  linkage: average
  mags: null 或 { leafIds, merges }
  samples: [{ group: AD | NC | all, leafIds, merges }, ...]

merges 每行：[左子节点索引, 右子节点索引, 合并距离, 叶子数量]
```

`leafIds` 是 linkage 输入顺序，不一定等于热图展示顺序。前端必须用稳定 ID 映射到显示坐标，再把叶端对齐单元格中心。

`magDendrogram.js` 是页面和导出的共享几何层；正常方向样本树在上、MAG 树在左，转置后交换。树深 80 px、占位 96 px，按轴独立缩放距离；AD / NC 的两棵样本树共用样本距离尺度。

隐藏树开关只隐藏分支，不撤销聚类排序；无聚类或不足两项时不造树。树展示的是合并关系，当前没有“点击折叠簇并汇总丰度”的功能。

### 8.4 页面与导出不同渲染器

- 页面：`MagZoomableHeatmap.jsx` 使用 SVG，按相机组织颜色路径，避免每个单元格创建独立 React DOM；辅助预览来自小型矩阵图像。
- 变换动画：`HeatmapTransposeMotion.jsx`；转置映射在 `magHeatmapGeometry.js`。
- 静态导出：`magHeatmapOption.js` 构造 ECharts heatmap + graphic 树枝，再由 `chartExport.js` 下载。
- 注册：`HeatmapEChart.jsx` 必须包含 GraphicComponent；构造了 graphic 但没注册组件会导致树枝丢失。
- 页面格子、注释条、树和标签有不同缩放规则；树深与字号保持显示像素，叶端跟随矩阵移动。

因此修改热图时要同时检查 SVG 页面层、导出 option 层和共享树坐标，不能只改其中一个。

## 9. 导出：最近修复的重点

### 9.1 曾经的问题与当前解法

原来按每格 20 × 22 px 铺开 872 个 MAG，图片变成上万像素宽，但树深仍为 80 px、字号仍约 11 px。把整张图缩小显示后，它们就几乎不可读。

当前用 `magHeatmapExportLayout`：在所选画布内适配完整矩阵，保留文字、树深和注释条的输出尺寸，依据实际空间疏排轴标签。

- 标准画布：1100 × 640；大图：1800 × 1000。
- MAG 热图当前导出菜单提供 SVG / PNG 和标准 / 大图选项；不要误写为它已拥有共享条形图的所有自定义尺寸选项。
- PNG 默认 2×；SVG 保留全部单元格和树枝，可无损放大。
- 数据密集时标签抽稀是展示措施，矩阵和树不能随标签抽稀删掉。
- 导出使用完整当前选中集合，不是浏览相机里暂时可见的窗口。
- 配色、色阶边界、轴方向、树与缺失 / 恒定值标注应与页面一致。

### 9.2 通用导出约束

- 临时创建独立 ECharts 实例，不在用户当前实例上清空数据 / 恢复缩放来导出。
- 排除 tooltip、toolbox、dataZoom、brush 等交互控件。
- PNG 大矩阵通过完整 SVG 栅格化，减少 canvas 增量绘制销毁后的回调问题。
- 控制最大像素边长 / 总像素；只增加倍率不能解决布局比例错误。
- 导出文件名包含视图、版本、范围 / 投影指纹及必要参数。
- 不把 RGB 截图验收等同于完整 SVG 验收；要检查分支数量、文本和无 NaN / Infinity。

当前热图配置 JSON 的 `renderingVersion` 仍为 `mag-heatmap-v5`；最后一次导出布局修复没有单独升级它。若后续将其用于严格渲染复现，应集中整理版本规则，同时保持旧配置兼容，不能只改字符串就宣称可复现。

## 10. 查询、Top N 与浮层经验

### 10.1 自动补全

- 大数据实体选择使用 ID / 名称候选，不要求用户完整拼出 MAG ID。
- MAG 搜索使用服务端候选，防抖、请求取消和过期结果处理都要保留。
- 人工清单选项落入稳定 ID，不把显示名称当主键。
- 选择候选不应重复提交两次；输入、键盘导航、确认、点击搜索的责任要分清。
- 保留手动输入和未知 / 无匹配提示；自动补全不是强行纠正为第一个候选。
- 样本候选不能只来自列表当前前 20 项。

### 10.2 数量面板

| 视图 | 已有范围 / 约束 |
| --- | --- |
| 物种 / KO 丰度 | 1–500 |
| 分类组成 | 1–50，数量基于分类项而非全部物种数 |
| KO 贡献 | 1–100 |
| 社区差异热图 / KO 阈值分布 | 1–200 |
| 差异 KO | 1–100；无显著结果保持空 |
| PCA | 2–500，属于参与计算的特征选择 |
| MAG 丰度 / 热图 | 结合当前匹配数与接口限制；MAG 全部匹配可使用约定的 0 |

预设、滑条、自定义整数、推荐数量和全部匹配应围绕实际 available / matched count。社区“全部匹配”提交实际数量，不使用 MAG 的 0 语义。

热图数量面板确认后还要外层“应用设置”；这一步改变科学查询。文案已经说明，不要后续把确认按钮改成暗中自动重算。

### 10.3 浮层与主题

- 普通 select 用 `StyledSelect`，复杂数量用 Popover；不要回退到浏览器默认菜单。
- 浮层进入 body Portal 后不再自动继承工作区 CSS，必须复制主题变量。
- 需要按窗口边界放置并随 scroll / resize 更新；MAG 数量浮层曾出现滚动前被切掉、滚动后才恢复的现象。
- 内层 select 的鼠标 / Escape 不应顺带关闭外层导出面板。
- 保留 focus 恢复、ARIA 名称与键盘交互。
- 浏览器测试选当前可见 role=option；过渡退出中的旧菜单 DOM 可能仍存在，直接按 data 属性选会误命中。

## 11. 主题与用户偏好

| 工作区 | 主色 |
| --- | --- |
| 物种 | 蓝色 `#2f80ed` |
| 功能 | 青色 `#118a88` |
| MAG | 玫红 `#b65770`；标题软底 `#f3eff2` |

统一入口：`frontend/src/styles/workspace-theme.css`。图内科学配色不等于页面主题色；质量图只有两类时用两色方案，分类图可用多类别方案，Z-score 使用以零为中心的发散色阶。

用户在本聊天明确表达的偏好：

1. 用 MAG 已完善的布局和共享组件适配物种 / KO，不能只给原来的加粗文字换颜色就称为统一布局。
2. 工具栏要有实际作用，避免重复或无效按钮；导出应是可识别的圆角按键与面板。
3. 科研配色要多，可按图形类别选择，不能把多色分类方案硬塞给仅两组的散点图。
4. 相邻 MAG 柱组分隔线保留，独立放在工具栏控制。
5. 悬浮识别只在数据图形上，减少鼠标穿过空白处造成整图变化。
6. 图表不大时不要机械增加全局预览；成熟的连续矩阵 / 大条形图导航能力继续保留。
7. Top N 需要真实自定义能力，不能只有几个固定值。
8. 表格拖到底部可自动向下滚动持续增高；本次已按要求提高滚动速度。
9. 先核对原因再修复，给实际效果；对于简单可逆修改，不需要冗长的验收流程。
10. 如果用户说“先聊 / 先构思”，先讨论再实现，不急着写规划任务书。

## 12. 后续研究模块：已规划不等于已完成

当前模板在 `MagResearchPlans.jsx`，包括：

| 模块 | 待补输入 / 分析 | 开发接入重点 |
| --- | --- | --- |
| MAG 功能潜力 | 稳定 MAG ID 关联的 KO、CAZyme、ARG、BGC 与工具 / 数据库版本 | 区分编码潜力与表达活性，核对基因 / contig / MAG 层级 |
| 定量与检出证据 | 样本 × MAG reads 支持、覆盖广度、平均深度、比对参数 | 丰度与支持证据联查，不拿样本整体映射率替代 MAG 覆盖 |
| 批次与协变量稳健性 | 预定义方案、校正模型、批次内与敏感性结果 | 与现有未经校正统计明确并列，不把筛选当校正 |
| 系统发育关系 | 比对、treefile / contree、模型、支持度和参考版本 | 使用真实树文件与叶 ID，区别 GTDB 分类定位树 |
| 独立队列验证 | 独立样本、统一定量、固定候选、评价方案 | CHN / CHN2 来源记录不能冒充独立外部验证 |

这些模块目前只是研究问题、已有基础、缺失输入和预期呈现模板。后续用户交付数据时，先建立输入 schema、版本和 ID 关联测试，再启用真实图形；不能仅把标签改成“完成”。

## 13. 验证记录与推荐命令

### 13.1 最新已完成验证

2026-10-08 推送 `49750bb` 前：

- 前端：63 个测试文件，290 项测试通过。
- 后端：205 项通过，2 项环境条件跳过，14 个 subtests 通过。
- 跳过项涉及 Windows symlink 权限及专用 live MySQL 条件；不是功能通过的替代声明。
- Ruff、mypy（74 个源文件）、ESLint、TypeScript 检查通过。
- 前端生产构建通过。
- 后端有 Starlette / httpx 的已有弃用提示；不等于当前测试失败。
- 本次没有在推送阶段重新跑完整网络依赖审计、覆盖率、全套 E2E 和 R 模型 smoke；此前局部浏览器检查和 R 环境记录应分别理解。

热图真实数据验证：185 个样本 × 20 个 MAG 的 AD / NC 组内聚类共 202 个分支；185 × 872 的全样本 / 全 MAG 聚类共 1,055 个分支。两个轴方向、完整数据值、树对齐、SVG 及实际 2× PNG 下载均验证过。

### 13.2 常规命令

```powershell
# 根目录：综合日常检查
npm run verify

# 前端，按需要进入 frontend
npm run lint
npm run typecheck
npm test
npm run build

# 根目录：后端相关检查
node scripts/backend-python.mjs -m ruff check app tests
node scripts/backend-python.mjs -m mypy app
node scripts/backend-python.mjs -m pytest -q

# 接口契约变更后生成，随后检查差异
npm run openapi
```

对单个模块的可逆修改，运行相关测试与 lint 即可；只有共享组件 / 接口 / 发布有具体回归风险时再扩大范围。不要每次为样式微调跑网络审计或重建数据。

### 13.3 本机沙箱工具问题

曾遇到 Windows 沙箱内 Vite `realpath` 返回 EPERM、Playwright / 本地套接字受限。通过相应授权工具运行后成功；不要为绕过工具权限而改坏项目代码。

pytest 默认临时目录也曾被拒绝。可在 backend 工作区显式指定一个本轮独立目录：

```powershell
node scripts/backend-python.mjs -m pytest -q --tb=short --basetemp=.tmp/pytest-your-task -p no:cacheprovider
```

pytest 会管理 / 清理 basetemp，所以只用明确的测试专用目录，不指向真实数据、项目根目录或其他聊天文件。

必要时使用已验证的 Vite / Vitest `--configLoader runner`，这是运行方式兼容方案，不需要擅自更改依赖锁文件。

## 14. 实际效果与调试资源

已纳入代码分支的 PNG 位于 `docs/previews/`，代表性文件：

- `mag-bar-layout-2026-10-07.png`：原生条形图导航布局。
- `mag-export-panel-2026-10-07.png`：图像导出设置。
- `species-species-native-bar-2026-10-07.png`、`function-species-native-bar-2026-10-07.png`：物种 / KO 适配。
- `mag-ranking-themed-menu.png`：主题下拉。
- `mag-heatmap-count-panel-2026-10-08.png`：数量浮层。
- `mag-heatmap-dendrogram-grouped.png`、`mag-heatmap-dendrogram-transposed.png`：组内聚类与轴交换。
- `mag-heatmap-clustering-method.png`：常显方法说明。
- `mag-heatmap-export-fitted-transposed.png`、`mag-heatmap-export-download.png`：修正后的完整导出。

本机 `.tmp/` 有一次性验证脚本，例如 `verify-mag-dendrogram.cjs`、`verify-mag-heatmap-export.cjs`、`verify-published-species-input.py`。它们被忽略，可能在新环境不存在；长期回归应优先依赖正式测试，不把临时脚本当部署必需品。

大型完整热图 SVG 样图约 23 MB，仅保留本地并被 Git 忽略，避免仓库因调试产物膨胀。

## 15. 经验浓缩：问题 → 根因 → 做法

| 现象 | 容易误判的根因 | 已有效的做法 |
| --- | --- | --- |
| 开关关闭了但悬浮仍变化 | axisPointer / 引擎强调与自绘高亮各自触发 | 明确一个事件入口，逐层控制 tooltip、emphasis 和分组标记 |
| 官方动画没长出来 | 重建实例、重复 setOption、首次 resize 取消入场 | 稳定 ID，保留原生 action，尺寸确定后再播放 |
| 拖动轴与预览重叠 | 轨道按整容器定位、矩阵按 grid 定位 | 用同一 grid 几何，导航预留区响应式避让 |
| 下拉 / 数量面板被切掉 | overflow 容器、固定偏移、Portal 丢主题 | Portal、视口边界避让、滚动重定位、复制主题 |
| 表格拖到窗口底部无法继续增高 | 只计算鼠标位移，未滚动外层页面 | 边缘自动滚动并把实际滚动量计入高度 |
| 新查询或翻页让图重置 | 状态共用、请求边界卸载整个工作区 | 科学数据 / 展示集合 / 列表 / 相机 / 样式分层 |
| 画了树但和行列不对应 | 把 linkage 输入索引当显示索引 | leafIds → 当前显示 ID → 单元格中心映射 |
| 组内聚类出现跨组大枝 | 将两组树人为接到共同根 | 分别成树，共用样本距离尺度，不造合并 |
| 导出字和树看不见 | 自然矩阵万像素，辅助元素固定小尺寸 | 先适配画布与矩阵，再疏排标签，不只提升倍率 |
| 页面好看、导出不一致 | 页面 SVG 与 ECharts 导出各自布局 | 共用变换、色域、树几何，分别验证两端 |
| 文件名写 LDA 就误报算法 | 旧名称没有随方法演进改名 | 从 model / 接口实际字段认定算法和单位 |
| 新数据解释太满 | 输入缺失或来源未对齐 | 保留未知状态、缺项和方法版本，不补造事实 |

## 16. 新聊天需特别辨别的历史信息

以下是已知文档 / 命名残留，不是新的用户任务，不需要开工就大规模修改：

1. README、MAG 接入指南和 LOCAL_SETUP 某些段落保留 mag_v2 的默认或历史状态；本机此前运行的是 mag_v3。
2. MAG 接入指南还有“热图每段 50 行”“固定 Top 10/20/30/50”等旧描述；当前已是连续矩阵与数量面板。
3. 热图导出已经按画布适配，旧“尺寸不会缩小原图”的表述不适用于当前完整热图布局。
4. `KoLdaBarChart.jsx` / 少数旧更新文案的 LDA 名称不能替代当前 rank-biserial 代码语义。
5. `LOCAL_SETUP.md` 的 179 后端 / 140 前端测试计数是历史值；最新本轮是 205 / 290。
6. API / 配置指纹、MAG 包 data fingerprint、manifest 文件 SHA-256 是不同标识，不要把它们混成一个版本号。
7. 本文不会保证服务始终在线；新聊天重新确认端口和配置。

如果下一任务是文档整理，应集中核对这些陈旧表述；若下一任务是功能开发，只在相关范围内同步更新，不借机改写无关模块。

## 17. 下一轮开发如何选择入口

下一轮的具体目标尚未由用户指定。本聊天结束的是一轮可视化和交互优化，不代表必须自动进入功能注释开发。

| 用户下一需求 | 推荐第一步 |
| --- | --- |
| 继续优化某个页面 / 交互 | 找对应业务适配器，再定位共享控件；先复现实际行为 |
| 新增 MAG 功能注释 | 核对交付文件、稳定 MAG ID、注释粒度、工具 / 数据库版本，再设计接口 |
| 增加树的点击合并 / 簇折叠 | 先讨论聚类树交互与丰度聚合语义，区分视觉折叠、簇代表和真正重算 |
| 加协变量模型 | 与现有未校正效应并存，定义样本范围、模型与结果契约；不要把筛选说成校正 |
| 增加覆盖证据 | 获取样本 × MAG reads / breadth / depth 表；先验证零和缺失及定量单位 |
| 整理项目上线 / GitHub | 先确认分支、数据权限和环境，按用户授权做 PR / 合并 / 部署 |
| 统一文档 | 以当前代码核对 mag_v3、连续热图、导出布局、数量面板和算法文案 |

新功能遵循：真实输入 → 数据契约 → 身份 / 值域校验 → API 与方法说明 → 业务适配 → 复用共享组件 → 针对性验证 → 更新文档。

## 18. 可复制给新聊天的开场说明

```text
请继续开发 G:\project\admeta。先阅读根目录 AGENTS.md 和
docs/development/2026-10-08-development-handoff.md，再核对 git status、当前分支和最新代码。

上一轮已推送 codex/20261008-update，代码提交 49750bb，尚未在本聊天合并 main。
MAG、物种/KO 共享条形图、自动补全、主题下拉、Top N、聚类热图和导出布局已有成熟实现。
保持样本范围、原始丰度、统计族、缺失值和研究解释边界，优先有针对性地复用与适配。
本文是交接快照，不要因旧文档而回退功能，也不要自动开发所有待完成研究模板。

我的下一项具体开发需求是：［在这里补充需求或截图］。
```

## 19. 进一步阅读索引

- 更新总览：`docs/development/20261008-update.md`。
- MAG 主布局和查询分层：`docs/development/2026-10-02-mag-visualization-refactor.md`。
- 工具栏和箱线图：`2026-10-03-chart-style-toolbar.md`、`2026-10-03-box-style-toolbar.md`，同目录。
- 热图选择与科研口径：`2026-10-03-mag-heatmap.md`，同目录。
- 导航与原生绘图：`2026-10-04-mag-bar-navigation.md`、`2026-10-06-mag-native-echarts.md`，同目录。
- 研究面板：`2026-10-04-mag-research-panels.md`，同目录。
- 自动补全：`2026-10-05-entity-autocomplete.md`，同目录。
- 主题下拉与数量：`2026-10-08-themed-selects.md`，同目录。
- 树状图与最近导出修复：`2026-10-08-mag-dendrogram.md`，同目录。
- 稳定运行入口：`docs/guides/runbook.md`。
- MAG 数据契约：`docs/guides/mag-data.md`，注意第 16 节列出的陈旧段落。
- 来源事实与缺项：`docs/guides/server-transfer-audit.md`。

新聊天不需要一次读完所有历史日志。先读本文和本次任务相关代码，再按问题查对应记录，通常更容易保持上下文清楚。
