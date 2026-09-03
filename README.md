# AD-Meta

AD-Meta 是一个面向阿尔茨海默病（Alzheimer's Disease, AD）脑肠轴研究的肠道宏基因组研发辅助工具。系统以宏基因组生物信息分析结果为数据基础，当前支持群落物种组成、KO 功能，以及 MAG（Metagenome-Assembled Genomes，宏基因组组装基因组）丰度、GTDB 分类和 CheckM2 质量的分析与可视化。MAG 功能注释及独立跨队列复现仍待数据接入。

项目采用 React/Vite 前端、FastAPI 后端与内网 R/Bioconductor 统计 worker。后端以不可变 revision 原子发布预计算结果，前端通过只读 API 完成交互式分析展示。

本仓库不包含原始测序数据处理和 MAG 分析脚本。项目背景、数据来源及与生物信息分析流程的边界见 [项目说明](docs/project-overview.md)。

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
Rscript -e 'renv::run("server.R", project = ".")'

# 终端 2（项目根目录）
npm run dev:backend

# 终端 3（项目根目录）
npm run dev:frontend
```

`npm run dev:backend` 会先执行 `sync:analysis`，把
`backend/storage_manifest.json` 中的分析运行、样本范围与产物关系同步到数据库。
只执行数据库迁移不会创建这些登记记录。多副本部署应先单独运行
`npm run prepare:runtime`：全新数据库从受管原始文件完成 storage bootstrap，
已有已发布数据集时只同步分析运行；成功后再启动各 Uvicorn 进程，避免副本重复导入数据。

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`
- 统计 worker：`http://127.0.0.1:8001`（仅供后端调用）

MySQL 本地连接参数模板见 [`.env.example`](.env.example)，完整步骤见
[本地运行与数据导入](docs/guides/runbook.md)。

## MAG 数据接入

将外部交付的 `ADMetaData` 文件夹放在项目根目录即可使用默认配置，也可在
`.env` 中设置 `AD_META_MAG_DATA_ROOT` 为其他数据包目录。相对路径始终基于项目根目录解析。
默认应用只读 `development_input/mag_v2`，不改写数据、不在业务请求中访问 `source_data`、不导入既有物种/KO 表。
数据包已排除在 Git 之外，运行时始终从配置路径只读访问。

若交付包只有 `mag_v1`，先运行一次 `npm run prepare:mag:v2`，由只读源结果生成经 872-MAG ID 核验的分类、质量与来源清单；该命令不覆盖已有版本。再运行 `npm run validate:mag`，验证通过后按上述方式启动服务，打开
`http://127.0.0.1:3000/analysis/mag`。无需重新 bootstrap 原有数据。
完整说明和 API 参数见 [MAG 丰度、分类与质量接入](docs/guides/mag-data.md)。

Windows 下同样使用三个终端启动统计 worker、后端与前端，具体命令见
[运行手册](docs/guides/runbook.md)。

验证分为三档：

本地 Node.js 要求为 22 或更高版本（与 CI 一致）。

- `npm run verify`：快速、离线的日常检查，包含 Ruff、mypy、前端类型检查、单元测试和生产构建。
- `npm run verify:full`：增加覆盖率、只读 OpenAPI 漂移检查、依赖漏洞审计和隔离 E2E；需要网络并预先安装 Playwright Chromium。
- `cd stats-worker && Rscript -e 'renv::run("tests/model_smoke.R", project = ".")'`：在已恢复的 R 环境中验证 ANCOM-BC2 与 MaAsLin2 模型链路。

生产构建默认不生成 sourcemap，避免将完整前端源码随静态资源发布。如需上传到私有错误监控平台，可临时执行
`npm --prefix frontend run build -- --sourcemap hidden`，上传 `.map` 后再从部署目录删除。

E2E 固定使用后端 `18000` 和前端 `14173`，并在隔离的 SQLite/临时缓存中
重建数据；不会复用 `8000/4173` 上已经运行的开发或真实服务。
