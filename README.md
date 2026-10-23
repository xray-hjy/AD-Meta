# AD-Meta

AD-Meta 是一个面向阿尔茨海默病（Alzheimer's Disease, AD）脑肠轴研究的肠道宏基因组研发辅助工具。系统以宏基因组生物信息分析结果为数据基础，支持群落物种组成、KO 功能，以及 MAG（Metagenome-Assembled Genomes，宏基因组组装基因组）的丰度、分类、质量、来源关系、ARG / BGC 和系统发育结果分析与可视化；另提供 GMrepo 扩增子参考队列的菌属分布、身份核查、探索性检验与证据对照。

项目采用 React/Vite 前端、FastAPI 后端与内网 R/Bioconductor 统计 worker。后端以不可变 revision 原子发布预计算结果，前端通过只读 API 完成交互式分析展示。

本仓库不包含原始测序数据处理和 MAG 分析脚本。项目背景、数据来源及与生物信息分析流程的边界见 [项目说明](docs/project-overview.md)。

## 20261023更新

- **MAG 功能注释可视化**：接入 DRAM2 汇总包，新增功能谱、专题基因、功能携带者、基因坐标证据、覆盖代理量、ARG/BGC 与系统发育轨道；交互图表沿用项目 ECharts 风格，支持筛选、联查、导出和来源追溯。
- **数据与口径**：以内容哈希固定的 SQLite 查询库承载 872 个代表 MAG、约 211 万基因和 8 个注释命名空间；核对原始矩阵和基因明细，区分静态注释、样本丰度代理量与群落 KO 结果。
- **运行与文档**：补充 DRAM2 数据导入说明、API/数据库契约与可视化方案；保留历史修订引用并明确备份派生数据库的要求。
- **验证**：后端 283 项通过、1 项跳过；前端 405 项通过；ANCOM-BC2 / MaAsLin2 smoke test 通过；Chromium 浏览器 E2E 7/7 通过。

完整变更和验收记录见 [20261023 更新日志](docs/development/20261023-update.md)。

## 20261022更新

- **首页内容与展示**：集中管理首页文案、滚动背景和图集截图；补充物种、KO 与 MAG 的真实工作区示例，覆盖 Top 500 浏览、图表样式、折线图、配色选择及 MAG 全样本热图。
- **数据与方法**：展示当前队列的样本和结果规模，增加从公开数据、质控组装、多层级解析到工作区查询的紧凑流程；物种、群落功能、MAG 三条说明可交互展开，并连接相应分析入口与来源说明。
- **MAG 工作区**：补齐上游构建与下游解析的流程关系，优化节点详情、数据口径和来源文件查阅；按分析修订关联结果清单与归档脚本校验信息。
- **交互与展示**：优化流程图连线、卡片展开、键盘操作和窄屏布局；图表缩放、平移及全局预览保留在工作区。
- **数据核对**：把 dRep 输入质量表、筛选清单与成员结果纳入交叉校验；接入 15 项归档方法脚本的路径与 SHA-256 记录，作为方法资料和来源索引。

完整变更与验证范围见 [20261022 更新日志](docs/development/20261022-update.md)。

## 20261020更新

- **MAG 队列化接入**：以 `prjca022804-ad-nc` 统一管理共享样本、MAG 原始结果、独立模块修订和分析发布记录；原始大文件通过硬盘分发，不提交 Git。
- **分析模块扩展**：导入 CoverM 丰度和覆盖指标、CheckM2 质量、GTDB-Tk 分类、dRep 来源关系、DRAMMA ARG、antiSMASH BGC 与 IQ-TREE 树结果；各模块按原文件和来源分别校验。
- **管理方式调整**：移除旧版 `mag_vN` 加载、导入代码及本机旧表；迁移增加新队列表并清除旧 MAG 表。物种、群落 KO 数据保持独立修订，并可在队列结果中关联。

详细数据范围、校验口径和回归结果见 [20261020 更新日志](docs/development/20261020-update.md)及 [MAG 原文件导入说明](docs/guides/mag-source-import.md)。

## 20261018更新

- **GMrepo 外部证据**：完善来源登记与固定快照，新增主队列菌属派生、主外同属比较、候选评估、报告导出和独立复算；对证据不足的队列保留描述或暂缓状态。
- **群落分析数据**：接入 MetaPhlAn 4 种级物种与配对 DiTing KO / 通路结果，保留历史分析版本，增加结果选择和完整结果查看。
- **图表与工作区**：统一图表缩放、平移、导航和导出交互，更新首页分区动效、分析侧栏与选择控件。
- **启动与数据维护**：修复分析目录加载错误状态，改进代理配置与 MAG 冷加载；按来源数据集整理原始输入并补充部署说明。

完整记录见 [20261018更新日志](docs/development/20261018-update.md)，专题记录索引见[开发更新日志](docs/development/updates.md)。

## 20261013更新

- **主分支整合**：合入 MAG / 物种 / KO 开发更新、新版首页和 CI 修复，并完成 [Dependabot PR #13](https://github.com/xray-hjy/AD-Meta/pull/13) 的 13 项 Python 依赖升级。
- **GMrepo 外部参考**：新增队列与质量概览、参考样本核查、AD/NC 菌属箱线图与散点、身份审查、年龄 / 性别调整和证据对照；结果仅作为探索性研究线索。
- **数据与接口**：参考包按版本和 SHA-256 只读加载，独立于主物种 / KO / MAG 数据；同步 OpenAPI、前端类型和参考模块导出命令。
- **首页与部署**：新版首页及分析顶栏保留 GMrepo 入口，兼容窄屏导航，补充外部数据包配置和 MAG 独立建表 SQL。

完整记录见 [20261013更新日志](docs/development/20261013-update.md)，接口和科学口径见 [GMrepo 参考数据接入](docs/reference/gmrepo.md)。

## 20261010更新

- **正式首页**：首屏入口、物种 / KO / MAG / 自定义图集、数据来源与工作区入口。
- **滚动与动画**：立体画廊、完整图片吸附与连续切图、正文和三个大区块的过渡；真实 SVG 部件随机播放五种 Logo 动画。
- **代码整理**：首页内容、组件、hooks、动画和样式分别维护，提供[前端开发导航](frontend/README.md)及[首页维护说明](frontend/src/pages/home/README.md)。

完整记录见 [20261010更新日志](docs/development/20261010-update.md)。

## 20261008更新

- **MAG 工作区**：统一卡片、折叠标题栏、工具栏和结果列表布局；新增数据说明、连续处理流程、单 MAG 证据与研究扩展模板。
- **条形图与折线图**：接入 ECharts 原生柱线切换、柱体生长动画和双轴范围拖动；优化缩放、平移摇杆、全局预览、分组标记与仅在柱体触发的悬浮。物种丰度、门级组成、KO 丰度、KO 贡献和差异 KO 图按各自数据语义复用组件。
- **科研绘图样式**：增加连续、分类和双组科研配色，以及圆角、字号、网格、数值、纹理和箱线图设置；物种蓝、功能青、MAG 玫红主题同步到菜单与浮层。
- **查询与数量设置**：新增 MAG ID / 分类名称自动补全和键盘选择；统一圆角下拉框；MAG、物种与 KO / 功能 Top N 支持预设、自定义整数、滑条和明确应用，保留各视图接口上限与计算语义。
- **MAG 热图**：增加丰度概览、变化模式、候选筛选、样本与 MAG 聚类、横纵轴交换和完整矩阵导航；显示真实层次聚类树，并说明 average linkage、欧氏距离、输入变换及 AD/NC 组内聚类规则。
- **图像与数据导出**：增加圆角导出按钮、格式 / 尺寸 / 分辨率 / 默认设置面板；修复完整热图导出时标签与树枝过小的问题，完整矩阵按所选画布适配，PNG 高清输出、SVG 保留矢量细节。
- **表格与数据说明**：统一物种、KO、MAG 的数据折叠区域和查询布局；支持拖动表格高度、靠近窗口边缘自动滚动及可调每页数量；补充版本、样本范围、公开来源和丰度口径说明。
- **接口与运行支持**：新增 MAG 建议查询和热图筛选 / 合并记录契约，同步 OpenAPI 与前端类型；整理 185 个 CRR 样本的物种 CSV 输入、来源核对及本地启动脚本。

对比仓库 main 提交 `f0d583a`，完整清单见 [20261008更新日志](docs/development/20261008-update.md)。

## 目录结构

```text
admeta/
├── backend/              FastAPI、数据导入、预计算与缓存
├── frontend/             React 应用、页面骨架与 ECharts 可视化
├── stats-worker/         ANCOM-BC2 / MaAsLin2 内网统计服务
├── docs/                 项目说明、架构、参考和开发记录
└── package.json          根目录开发与数据重建命令
```

## 文档入口

完整索引见 [docs/README.md](docs/README.md)。

- [项目背景与边界](docs/project-overview.md)
- [系统架构与扩展约定](docs/architecture.md)
- [本地运行与数据导入](docs/guides/runbook.md)
- [API 契约](docs/reference/api.md)
- [数据库契约](docs/reference/database.md)
- [GMrepo 参考数据接入](docs/reference/gmrepo.md)
- [开发记录](docs/development/updates.md)

## 本地启动

后端默认使用本机 MySQL。连接参数保存在被 Git 忽略的 `.env` 中。首次转换时运行：

```bash
npm run migrate:sqlite-to-mysql
```

上面的迁移命令会把已有的 `backend/storage/ad_meta.sqlite3` 完整复制到空的
MySQL 数据库。新克隆、没有旧 SQLite 文件时，改用 `npm run bootstrap:storage`
从受版本管理的原始表格重建数据。

统计 worker 首次运行前，按 [stats-worker/README.md](stats-worker/README.md)
恢复锁定的 R 依赖。然后分别启动统计 worker、后端和前端：

```bash
# 终端 1（首次运行前先按 worker 文档恢复 R 依赖）
cd stats-worker
Rscript server.R

# 终端 2（项目根目录）
npm run dev:backend

# 终端 3（项目根目录）
npm run dev:frontend
```

`npm run dev:backend` 会先执行 `sync:analysis`，把
`backend/storage_manifest.json` 中的分析运行、样本范围与产物关系同步到数据库。
只执行数据库迁移不会创建这些登记记录。多副本部署应先单独运行
`npm run prepare:runtime`：全新数据库从受管原始文件完成 storage bootstrap，
已有已发布数据集时同步分析运行；MAG 的必需 raw 文件齐备且未导入时创建首个队列分析记录。成功后再启动各 Uvicorn 进程，避免副本重复导入数据。

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`
- 统计 worker：`http://127.0.0.1:8001`（仅供后端调用）

MySQL 本地连接参数模板见 [`.env.example`](.env.example)，完整步骤见
[本地运行与数据导入](docs/guides/runbook.md)。

## GMrepo 参考数据接入

访问 `/reference/gmrepo` 查看独立外部参考队列。默认读取
`ADMetaData/reference/gmrepo/processed/2026-10-09-v1`，也可在 `.env` 中设置
`AD_META_GMREPO_DATA_ROOT` 指向已验证的处理包；相对路径以仓库根目录解析。

仓库现提供约 620 KiB 的 [固定版本运行数据包](data-packages/README.md)，包含页面、身份审查、统计及来源 LDA 所需的 14 个文件。
`npm run dev:backend` 或 Windows 的 `.\Start-ADMeta.ps1 backend` 会先安装并校验默认目录；
已有通过校验的数据直接复用，自定义数据根目录由部署者管理。也可单独运行：

```bash
npm run setup:gmrepo
npm run verify:gmrepo
```

原科研快照、完整重处理归档和分析导出结果仍单独保存。
缺少或损坏的数据包返回明确的不可用状态，安装器拒绝覆盖已有异常目录。菌属统计按队列和身份审查条件开放，
不将测序 Run 自动视为独立参与者，不把参考队列结果称为主数据的数值复现。
目录契约、哈希校验、部署配置和导出方法见 [GMrepo 接入说明](docs/reference/gmrepo.md)。

## MAG 数据接入

MAG 原始结果保存在 `backend/storage/raw/ad-nc-mag/PRJCA022804/`，由队列导入器解析并写入数据库。
首次接收文件后运行 `npm run import:cohort -- --dataset prjca022804-ad-nc`；已发布结果可通过
`npm run validate:mag -- --dataset prjca022804-ad-nc` 核对。应用入口为
`http://127.0.0.1:3000/analysis/mag`。完整说明见 [MAG 原文件导入](docs/guides/mag-source-import.md)。

Windows 下同样使用三个终端启动统计 worker、后端与前端，具体命令见
[运行手册](docs/guides/runbook.md)。

验证分为三档：

本地 Node.js 要求为 22.12.0 或更高版本（与前端依赖及 CI 一致）。

- `npm run verify`：快速、离线的日常检查，包含 Ruff、mypy、前端类型检查、单元测试和生产构建。
- `npm run verify:full`：增加覆盖率、只读 OpenAPI 漂移检查、依赖漏洞审计和隔离 E2E；需要网络并预先安装 Playwright Chromium。
- `cd stats-worker && Rscript tests/model_smoke.R`：在已恢复的 R 环境中验证 ANCOM-BC2 与 MaAsLin2 模型链路。

生产构建默认不生成 sourcemap，避免将完整前端源码随静态资源发布。如需上传到私有错误监控平台，可临时执行
`npm --prefix frontend run build -- --sourcemap hidden`，上传 `.map` 后再从部署目录删除。

E2E 固定使用后端 `18000` 和前端 `14173`，并在隔离的 SQLite/临时缓存中
重建数据；不会复用 `8000/4173` 上已经运行的开发或真实服务。

## MAG 原文件与队列分析记录

MAG 结果通过硬盘复制到 `backend/storage/raw/ad-nc-mag/PRJCA022804/`；大数据文件不提交 Git。
物种、群落 KO、共用样本小文件和 MAG 文件清单继续提交 Git。
新导入直接解析原表并写入数据库，不需要历史 MAG 数据包。

```bash
npm run import:cohort -- --dataset prjca022804-ad-nc
npm run validate:mag -- --dataset prjca022804-ad-nc
```

详细说明：[MAG 原文件导入与拓展](docs/guides/mag-source-import.md)。
