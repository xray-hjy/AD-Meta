# DRAM2 summary 包接收与入档

## 结论与适用范围

接收本次新增的 DRAM2 功能注释时，只需在组员之间分发：

```text
G:\project\server_transfer\未整理入档的文件\1020\MAG\DRAM\summary\
```

该目录包含 `runs/20261022_233830_828587_1595139/` 和其中 26 个文件，总计 254,239,398 字节。已将它与本项目当前归档包逐文件比较，名称、数量、大小和 SHA-256 均一致。无需为这次功能接入复制或上传整个 `backend/storage/`。

这个结论针对“给已有项目补入 DRAM2 summary”。组员仍需有项目既有的 MAG 基础 raw 结果，因为 DRAM2 解析依赖已经导入的 CoverM 丰度、CheckM2 质量和 GTDB-Tk 分类。全新克隆且没有这些基础数据时，仅有 summary 包不能独立重建整个 MAG 队列。

## 复制位置

接收方先更新到 GitHub `main` 上已包含 DRAM2 `metabolism` 声明的代码，再把 `summary` 整个目录复制到仓库内：

```text
<repo>/backend/storage/raw/ad-nc-mag/PRJCA022804/DRAM2/summary/
└── runs/20261022_233830_828587_1595139/
    ├── run_summary.json
    ├── output_manifest.tsv
    ├── dram_all_genes.tsv.gz
    ├── mag_dram_annotation_summary.tsv
    ├── mag_distill_summary.tsv
    └── 其余矩阵及元数据文件
```

保留 `runs/<运行编号>/` 这一层和原文件名，不要只复制几张矩阵，也不要把文件平铺到 `summary/`。仓库里的 `backend/storage_manifest.json` 已指向这个运行目录；不需要组员手改路径或覆盖其它 MAG 原始目录。

## 接收后核验

先确认运行目录有 26 个普通文件，合计 254,239,398 字节。再用包内 `output_manifest.tsv` 核验其登记的结果文件；应用导入器会逐项比较大小和 SHA-256，并检查运行状态、872 个 MAG 与基础结果的一致性。

在已有项目环境和基础 MAG raw 数据齐备的前提下，从仓库根目录先做只校验、不发布：

```powershell
npm run import:cohort -- --dataset prjca022804-ad-nc --validate-only
```

检查报告中 `metabolism` 状态为 `ready`，且其摘要、基因和矩阵校验通过后，再执行正式导入并核对已发布结果：

```powershell
npm run import:cohort -- --dataset prjca022804-ad-nc
npm run validate:mag -- --dataset prjca022804-ad-nc
```

导入器按 manifest 处理整个队列，不是只更新 metabolism 单模块。因此即使本次只分发 DRAM2 文件，正式导入时仍需要组员现有的队列 raw 输入和按项目 runbook 配置的数据库。`--validate-only` 也会检查同一 manifest 中其它必需模块；任一必需输入缺失或校验失败时不要正式发布。

## 文件与数据库保存

- summary 原件保持只读；新一轮输出使用新的运行编号目录，不能覆盖已登记的运行。
- 导入会在 `backend/storage/derived/mag-functions/` 建立内容哈希命名的 SQLite 查询库，并在数据库修订中固定路径和 SHA-256。组员第一次导入时由本机生成，无需额外分发整个 storage。
- 若接收的是已经发布的数据库备份而不是重新导入，则还需同时恢复该修订引用的派生 SQLite 文件；仅有 MySQL 不能提供功能明细查询。
- summary 包中的 KO 矩阵单位是 MAG × KO 基因计数，不是样本 × KO 群落丰度；缺少注释不等于功能缺失。对外说明应保留这一口径。
