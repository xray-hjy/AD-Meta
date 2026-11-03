# 20261024 本地同步记录

> 后续进展：同日已收到桌面 summary 并完成 DRAM2 后端接入及数据库升级，旧 MAG 表保留为归档表。下文保留代码同步完成时的状态；当前结果见 [DRAM2 summary 本机接入](20261024-dram2-summary-ingest.md)。

## 同步结果

本地 `main` 从 `e77ccecd8274c27981002c9db087951b3c633b35` 快进至 `0607163c44b752d9dc72c77f53ed902fdccd32a6`，整合 GitHub 主分支的四个提交，共 148 个文件的上游变更：

| 提交 | 内容 |
| --- | --- |
| `7f3014f` | MAG 队列原文件与模块修订接入 |
| `2337658` | 首页及 MAG 流程、来源展示更新 |
| `f4f60ba` | MAG 功能可视化与研究工作区 |
| `0607163` | DRAM2 summary 包交付说明 |

当前 HEAD 与获取时的 `origin/main` 一致。本地群落默认运行、GMrepo 本地来源快照、修订隔离、恢复工具、测试及开发记录继续保留为未提交修改。

## 本地资料保持与合并

更新前备份了 5,163 份文件，包括已修改代码、未跟踪文件、完整本地 storage、GMrepo 资料及本地配置。压缩备份 487,733,150 字节；另对当前 MySQL 做单事务导出并完成 gzip 读回校验，压缩后 93,466,541 字节。

七份重叠文件结合上游变更处理：主属级服务、导入清单、原始数据目录说明、MAG 资料说明与清单、文档索引、更新日志。新版 MAG 文件清单保留原 3,440 条来源记录，并增加上游 19 条登记，没有替换既有来源行。

其余 5,156 份受保护文件的字节数、SHA-256 与权限逐项一致。两份 macOS 锁定数据的内容、权限、锁定属性和修改时间也保持不变。原版本代码有恢复分支和 stash，完整原件与冲突前后文本均在备份中。

本机恢复资料位于 `.tmp/git-sync/20261024-155057/`，包含 `manifest.json`、`local-code-and-data.tar.gz`、`database-before-migration.sql.gz`、`local-restore-result.json`、`preservation-after.json`、`locked-file-preservation.json` 等。恢复分支为 `codex/backup-before-pull-20261024-155057`。

## 外部数据的实际状态

从已有归档中按上游清单的原始 SHA-256 找到并补入 16 份缺失文件：15 份方法脚本和 `drep_genomeInfo.csv`。仅复制完全相同的原件，没有执行脚本。

本地仍缺三份 dRep 输入：

- `dRep/dRep_input/genomeInfo.csv`
- `dRep/dRep_input/quality_filtered_MAGs.list`
- `dRep/dRep_input/quality_filtered_MAGs.tsv`

新版必需的 DRAM2 summary 批次 `20261022_233830_828587_1595139` 尚未收到，五个显式输入均缺失：`run_summary.json`、`output_manifest.tsv`、`mag_dram_annotation_summary.tsv`、`dram_all_genes.tsv.gz`、`mag_distill_summary.tsv`，以及该包 manifest 声明的其他配套文件。它们不随 Git 分发，接收方式见 [DRAM2 summary 包交接](../guides/dram2-summary-package.md)。

此次完成代码同步和本地修复整合，没有执行数据库迁移或 MAG 重新导入。上游首次启动准备流程包含数据库升级，并移除旧 MAG 包表；后续启用新版 MAG 前应先补齐所需原件，使用当前交付说明核验与导入。旧数据库已备份，当前原始资料、矩阵与历史引用均保留。

## 本机验证

- 后端全量：**295 passed，1 skipped，14 subtests passed**；测试使用隔离的 SQLite 路径。
- 前端全量：**91 个测试文件、405 项测试通过**。
- 前端生产构建通过。
- GMrepo 核心运行包 14 文件及处理指纹校验通过。
- 无启动迁移的接口检查通过：健康、物种摘要、KO 摘要、GMrepo 目录、多候选目录均为 HTTP 200。物种为 185 样本 / 1,828 特征，KO 为 185 / 9,537，多候选为主队列 966 属 / 外部各 322 属 / 目录 1,113 项。
- 本次整合的代码、配置与文档通过限定路径的 `git diff --check`；原始资料保留原有格式，未对 CRLF 数据进行全局格式修正。
- 无未合并索引项。没有创建本次发布提交或推送远程。
