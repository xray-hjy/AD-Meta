# AD-Meta

AD-Meta 是面向阿尔茨海默病（AD）与肠道菌群宏基因组数据的可视化分析平台。项目采用 React 前端与 FastAPI 后端分离架构，后端预计算图表数据，前端通过只读 API 渲染物种丰度、KO 功能和分类层级等分析结果。

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

安装依赖并根据 `backend/storage_manifest.json` 重建本地数据库与图表缓存后，在 macOS/Linux 项目根目录运行：

```bash
npm run dev
```

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

Windows 下使用两个终端分别启动后端与前端，具体命令见 [运行手册](docs/guides/runbook.md)。
