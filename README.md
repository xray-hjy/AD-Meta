# AD-Meta

AD-Meta 是一个面向阿尔茨海默病（Alzheimer's Disease, AD）脑肠轴研究的肠道宏基因组研发辅助工具。系统以宏基因组生物信息分析结果为数据基础，当前支持群落物种组成和 KO 功能层面的分析与可视化，并面向 MAG（Metagenome-Assembled Genomes，宏基因组组装基因组）的分类、丰度、功能及特殊功能解析进行扩展。

项目采用 React 前端与 FastAPI 后端分离架构，后端预计算统计结果和图表数据，前端通过只读 API 完成交互式分析展示。

本仓库不包含原始测序数据处理和 MAG 分析脚本。项目背景、数据来源及与生物信息分析流程的边界见 [项目说明](docs/project-overview.md)。

## 目录结构

```text
admeta/
├── backend/              FastAPI、数据导入、预计算与缓存
├── frontend/             React 应用、页面骨架与 ECharts 可视化
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

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

MySQL 本地连接参数模板见 [`.env.example`](.env.example)，完整步骤见
[本地运行与数据导入](docs/guides/runbook.md)。

Windows 下使用两个终端分别启动后端与前端，具体命令见 [运行手册](docs/guides/runbook.md)。
