# AD-Meta

AD-Meta 是一个面向阿尔茨海默病（Alzheimer's Disease, AD）脑肠轴研究的肠道宏基因组研发辅助工具。系统以宏基因组生物信息分析结果为数据基础，当前支持群落物种组成和 KO 功能层面的分析与可视化，并面向 MAG（Metagenome-Assembled Genomes，宏基因组组装基因组）的分类、丰度、功能及特殊功能解析进行扩展。

项目采用 React/Vite 前端、FastAPI 后端与内网 R/Bioconductor 统计 worker。后端以不可变 revision 原子发布预计算结果，前端通过只读 API 完成交互式分析展示。

本仓库不包含原始测序数据处理和 MAG 分析脚本。项目背景、数据来源及与生物信息分析流程的边界见 [项目说明](docs/project-overview.md)。

## 目录结构

```text
admeta/
├── backend/              FastAPI、数据导入、预计算与缓存
├── frontend/             React 应用、页面骨架与 ECharts 可视化
├── stats-worker/         ANCOM-BC2 / MaAsLin2 内网统计服务
├── docs/                 项目说明、架构、参考和开发记录
├── docker-compose.yml    容器化运行编排
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

然后分别启动后端和前端：

```bash
# 终端 1
npm run dev:backend

# 终端 2
npm run dev:frontend
```

`npm run dev:backend` 会先执行 `sync:analysis`，把
`backend/storage_manifest.json` 中的分析运行、样本范围与产物关系同步到数据库。
只执行数据库迁移不会创建这些登记记录。非 Compose 的多副本生产部署应先单独
运行 `python -m app.cli.prepare_runtime`，成功后再启动纯 Uvicorn 进程。
单实例 Docker 后端入口仍会自动执行准备流程。Compose 部署则由一次性的
`backend-init` 服务先运行 `python -m app.cli.prepare_runtime`：全新数据库从受管
原始文件完成 storage bootstrap，已有已发布数据集时只同步分析运行。后端副本
只在初始化成功后启动，不会各自重复导入数据。

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

MySQL 本地连接参数模板见 [`.env.example`](.env.example)，完整步骤见
[本地运行与数据导入](docs/guides/runbook.md)。

Windows 下使用两个终端分别启动后端与前端，具体命令见 [运行手册](docs/guides/runbook.md)。

验证分为三档：

本地 Node.js 要求为 22 或更高版本（与前端构建镜像和 CI 一致）。

- `npm run verify`：快速、离线的日常检查，包含 Ruff、mypy、前端类型检查、单元测试和生产构建。
- `npm run verify:full`：增加覆盖率、只读 OpenAPI 漂移检查、依赖漏洞审计和隔离 E2E；需要网络并预先安装 Playwright Chromium。
- `npm run verify:containers`：在独立 Compose 项目和 `18080` 前端端口中构建并启动完整栈，验证 MySQL、R worker、双后端副本和 Nginx；需要正在运行的 Docker，完成或失败后只清理本次测试卷。

生产构建默认不生成 sourcemap，避免将完整前端源码随静态资源发布。如需上传到私有错误监控平台，可临时执行
`npm --prefix frontend run build -- --sourcemap hidden`，上传 `.map` 后再从部署目录删除。

E2E 固定使用后端 `18000` 和前端 `14173`，并在隔离的 SQLite/临时缓存中
重建数据；不会复用 `8000/4173` 上已经运行的开发或真实服务。
