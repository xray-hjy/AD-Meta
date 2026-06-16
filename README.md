# AD-Meta

AD-Meta 是用于 AD/NC 宏基因组数据分析展示的前后端项目。当前架构为后端预计算图表数据，前端通过 API 读取缓存结果进行可视化渲染。

## 文档入口

- `docs/runbook.md`：本地启动、数据导入、运行和部署流程。
- `docs/api.md`：当前后端 API 与图表 payload 契约。
- `docs/database.md`：数据库表结构与导入规则。
- `docs/updates.md`：当前版本相对 GitHub 历史版本的更新日志。
- `docs/legacy-frontend-code-reference.md`：旧版前端直读 Excel 的代码说明，仅作历史参考，不作为当前开发依据。

## 数据说明

原始公开数据位于 `backend/storage/raw/**`，会随 Git 提交。SQLite 数据库
`backend/storage/ad_meta.sqlite3` 和图表缓存 `backend/storage/cache/**` 不进入 Git，
由原始数据重建。

clone 项目并安装依赖后，运行：

```bash
npm run bootstrap:storage
```

该命令会读取 `backend/storage_manifest.json`，重新导入 raw 数据并生成本地
SQLite 与图表缓存。之后运行：

```bash
npm run dev
```
