# AD-Meta 文档索引

文档按用途划分。开发时以代码和 API 实际行为为准；接口、数据库或架构发生变化时，应在同一次修改中更新对应文档。

## 项目说明

- [项目背景与边界](project-overview.md)：研究背景、数据来源、生信流程现状及仓库职责。
- [系统架构与扩展约定](architecture.md)：前后端结构、数据流、目录职责和新增可视化的规则。

## 使用指南

- [本地运行与数据导入](guides/runbook.md)：环境安装、服务启动、数据导入、缓存重建和部署。

## 技术参考

- [API 契约](reference/api.md)：公开只读接口与图表 payload。
- [数据库契约](reference/database.md)：科学数据表、应用支撑表和导入约束。

## 开发记录

- [综合更新日志](development/updates.md)
- [2026-07-12 更新日志](development/2026-07-12-release-notes.md)
- [前端 UI 重构记录](development/frontend-ui-refactor-update.md)
- [分类层级可视化开发与优化记录](development/taxonomy-visualization-development.md)
- [矩形树图重排问题调查](development/treemap-rerender-investigation.md)

`development/` 中的内容用于解释本轮开发决策，不作为稳定接口契约。旧版前端直读 Excel 的参考文档已经移除，当前实现只以 React、后端 API 和预计算缓存架构为准。
