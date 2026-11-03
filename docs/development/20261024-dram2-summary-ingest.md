# 2026-10-24 DRAM2 summary 本机接收与后端接入

## 接收结果

用户提供的 `/Users/x-ray/Desktop/summary` 已复制到：

```text
backend/storage/raw/ad-nc-mag/PRJCA022804/DRAM2/summary/
└── runs/20261022_233830_828587_1595139/
```

共 26 个普通文件、254,239,398 字节，目录结构与既有 manifest 相符，无须修改后端输入声明。复制使用临时目录及原子改名，逐文件核对字节数和 SHA-256；副本设为只读。桌面原件的内容、权限及修改时间均未改变。

包内 `output_manifest.tsv` 登记的 24 个结果文件全部通过校验；另对该清单自身及 `run_summary.json` 登记独立 SHA-256，覆盖全部 26 个文件。MAG 归档清单保留原有 3,459 行及其原始字节，仅追加本次 26 行，来源路径记录实际接收位置。

## 数据核对与发布

独立核对脚本 `scripts/audit-dram-summary.py` 确认：

- 872 个 MAG（细菌 869、古菌 3）与现有 CoverM、dRep 代表和 GTDB-Tk 集合一致。
- CheckM2 全字段、GTDB 分类、CoverM 长度以及 DRAMMA 每 MAG 预测蛋白总数吻合；蛋白总数吻合不等于不同工具间基因身份已一一核对。
- 全基因表包含 2,113,311 条记录；逐 MAG 基因总数一致，独立回算 KO 矩阵的差异单元格为零。
- 8 类 counts/presence 矩阵全部通过非负计数及存在状态一致性检查。正式导入器进一步从基因记录回算全部 8 类命名空间，与矩阵逐项核对通过。

| 功能命名空间 | 特征数 |
| --- | ---: |
| KO | 6,787 |
| EC | 2,466 |
| CAZyme 家族 | 529 |
| CAZyme 亚家族 | 5,115 |
| 底物预测 | 41 |
| MEROPS 家族 | 240 |
| MEROPS 命中 | 35,133 |
| DRAM HMM | 9 |

队列 `prjca022804-ad-nc` 已发布，`metabolism` 状态为 `ready`：

- 发布记录：`8da8fb8b5e526feda803f316347f0adacc6323f4ad69e932e2a1bae1137da1ca`。
- 功能模块修订：`ccda7ed746eb8749f71e1137059e64c5ebc368d1aa3833693bb6f3f706632867`。
- 导入任务：`68125ffd44964e9fbc7addd4200e2082`。
- 查询索引：`backend/storage/derived/mag-functions/c0debefc2c17a5efbeb07f4c182113d3129985d3eb635acf5309b1e5076c64f2.sqlite`，762,146,816 字节；文件名对应实际 SHA-256，导入后再次核验通过。

发布固定引用已有物种修订 `098416ecb5f143bba49867f26dd470c5` 和群落 KO 修订 `6b3ffaba9e9647e58b9a07a682a765a6`，185 个样本及 AD 122 / NC 63 标签按 ID 核对，未替换现有群落结果或 GMrepo 来源上下文。

## 数据库保留措施

本机原数据库版本为 `20260912_01`。新版 `20261020_02` 默认删除旧 MAG 包表，因此先生成完整 MySQL 单事务备份并完成 gzip 全量读回校验，再仅执行 `20261020_01` 新增队列表，调用导入服务完成校验和原子发布。

新发布成功后，将原有 10 张 MAG 表通过一次 `RENAME TABLE` 原子改名为 `archived_20261024_mag_*`，随后升级到正常启动要求的 `20261020_02`。共保留旧数据 338,557 行，逐表行数和 MySQL `CHECKSUM TABLE ... EXTENDED` 与迁移前一致；物种、KO 当前修订指针保持不变。正常启动流程已执行通过，没有再次导入该队列。

私有备份及接收凭据位于 `.tmp/dram2-ingest/20261024-summary/`。其中 `database-before-ingest.sql.gz` 为完整 SQL 备份，压缩后 91,827,536 字节；SHA-256 为 `37ef8c88264b64ab60826eb820380f3be0f86d878f1e099d4870c31249ca932c`。表名映射、原始行数、校验值和反向改名 SQL 也保存在该目录，恢复前需停服并核对数据库迁移状态。

## 真实运行验证

- 本地标准启动 `npm run dev` 成功，后端 `127.0.0.1:8000`、前端 `127.0.0.1:3000`。
- 24 项真实 HTTP 请求通过，包括存活与就绪、队列、功能摘要、8 类目录、KO 检索、携带 MAG、基因记录、矩阵、CSV、群落 KO 对照及原件下载，以及现有物种、群落 KO、GMrepo 多候选接口。
- `K00929` 原始基因计数为 297、携带 MAG 为 229；`K00634`、`K01442`、`K01580` 的目录数值也与独立核对报告一致。基因详情、矩阵和 CSV 的同一选择数值一致，原件下载内容及响应 SHA-256 一致。
- 项目正式 `validate:mag` 命令读回已发布结果，状态为 `valid`。
- Chromium 桌面实测进入“MAG 功能注释”、显示矩阵、检索 `K00929`、打开携带 MAG 的基因详情；无浏览器错误或失败 API 请求。截图及脚本保存在上述私有凭据目录。

本次复用已有解析和查询代码，未修改统计方法，也未重新执行生信工具或正式 R 模型。

## 已保留的缺项与语义

同一归档中仍缺少三份先前登记的 dRep 原件：

```text
dRep/dRep_input/genomeInfo.csv
dRep/dRep_input/quality_filtered_MAGs.list
dRep/dRep_input/quality_filtered_MAGs.tsv
```

因此 `lineage` 为 `not_provided`，`archive` 为 `invalid`。归档清单共登记 3,485 项，本机实际存在 3,482 项；存在文件的字节数均吻合。缺项状态如实保存，不删除旧清单行、不补造原件，不影响已核验的 DRAM2 功能、丰度、分类、质量、ARG、BGC、系统发育和覆盖模块。

`distill` 中与 KO 矩阵共有的 1,624 个单 KO 行，有 1,049 行、187,108 个单元格数值不同；原因和上游汇总规则仍未确认，状态保留为 `requires_review`。原表不改写；功能查询使用与基因证据一致的矩阵，不把 distill 的零值解释为功能缺失。

矩阵单位为 MAG × 功能的注释基因计数；它与样本 × KO 的 DiTing 丰度属于不同结果。MAG 注释、底物预测和专题集合只用于功能潜力与研究线索，不代表完整通路、实际表达、临床诊断或因果证据。

完整接收凭据及审计报告另存于 `backend/storage/provenance/dram2/2026-10-24-summary-reception/`。原始 summary、查询索引、数据库备份和凭据目录均保持 Git 忽略；本次没有提交或推送科研数据。
