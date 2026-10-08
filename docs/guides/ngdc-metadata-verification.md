# NGDC 元数据下载与当前样本核对

核查日期：2026-10-01。官方来源：[GSA CRA014435](https://ngdc.cncb.ac.cn/gsa/browse/CRA014435)、[BioProject PRJCA022804](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804)。

## 已确认的关系

PRJCA022804 是项目编号；CRA014435 是其关联的 GSA 测序数据集。官方导出包含 476 个 BioSample、476 个 Experiment、476 个 Run，本次逐条通过 `CRR → CRX → SAMC` 关联，不按行序或数量猜测对应关系。

| 官方样本标题中的分组 | Run 数 | 当前交付范围 |
| --- | ---: | --- |
| AD | 122 | 全部纳入 |
| NC | 63 | 全部纳入 |
| MCI | 119 | 未纳入当前交付 |
| SCD | 90 | 未纳入当前交付 |
| SCS | 82 | 未纳入当前交付 |
| 合计 | 476 | 当前 185 |

本地 `G:/project/data/metadata/metadata_NC_AD.csv` 中的 185 个 Run 与官方全部 AD/NC Run 集合完全一致；样本别名、SAMC、分组、年龄、性别均无冲突。性别比较将官方 male/female 对应到本地 M/F，整理表保留双方原值。

KO 原文件的标签按现有 `storage_manifest.json` 中 `1=AD、0=NC` 对照；MAG 元信息与本地清单完全一致；物种原表保留 373 行，其中 CRR 185、ERR 160、SRR 28，其 CRR 集合及分组与上述清单一致。本次没有修改矩阵或导入范围。

上述结果确认“交付了哪些样本”。团队最初为何选择全部 AD/NC、是否还执行过质量筛选，仍需要团队说明。

## 下载与整理的位置

原始下载和整理产物保存在 `backend/storage/provenance/CRA014435/2026-10-01/`，该目录按现有 storage 规则不提交到 Git。

- [本地整理说明](../../backend/storage/provenance/CRA014435/2026-10-01/README.md)
- [当前 185 个样本对应表](../../backend/storage/provenance/CRA014435/2026-10-01/samples_current185.tsv)
- [全部 476 个样本对应表](../../backend/storage/provenance/CRA014435/2026-10-01/samples_all.tsv)
- [当前样本的 FASTQ 文件清单](../../backend/storage/provenance/CRA014435/2026-10-01/fastq_files_current185.tsv)
- [核对结果](../../backend/storage/provenance/CRA014435/2026-10-01/reconciliation.json)
- [来源与输入校验值](../../backend/storage/provenance/CRA014435/2026-10-01/provenance_manifest.json)
- [官方网页核查记录](../reference/ngdc-source-observations-2026-10-01.json)

输入原件均保留，另存快照。官方 XLSX 的 SHA-256 为 `4c4eb08ebd00da254555a4229f125f53d7ced078a4f33979d64186a7f6451eec`；此前用户提供的 XLSX 为 `c961d456ada123161dc1a979408299ad01e17c87d1fbe5c1978fc894554f05a0`。

新旧 XLSX 只有两个下载地址字段变化，共 952 个单元格，从 `gsa3` 改为 `gsa4`；样本、实验、文件名、大小和预期 MD5 均相同。新地址直接取自官方导出，未自行拼接地址。

全部 FASTQ 共 952 个、3,023,200,389,266 字节，约 3.02 TB；当前 185 个样本对应 370 个文件、1,175,828,150,094 字节，约 1.18 TB，均为十进制单位。本次下载的是元数据；原始 FASTQ 的内容下载与 MD5 校验留待实际生信运行，当前溯源开发可使用已整理的文件清单。

## 空字段如何处理

官方 XLSX 的 `Host subject id` 和 `Host disease` 各有 476 条空值。抽查 [SAMC3310212](https://ngdc.cncb.ac.cn/biosample/browse/SAMC3310212) 页面也未展示受试者 ID。

分组可以从官方 `Sample title` 提取，本次已单独记录 `stage_source`，原始 `Host disease` 仍保持空值。受试者 ID 无法由 Run、SAMC 或别名推算，暂存为未提供。官方介绍为 476 名参与者，但个体级去重或重复采样分析仍需要匿名稳定 ID，或团队确认一人一份样本。

## 论文依据与待补资料

[Metagenomic analysis characterizes stage-specific gut microbiota in Alzheimer’s disease](https://www.nature.com/articles/s41380-025-02973-7)，*Molecular Psychiatry*，2025，DOI `10.1038/s41380-025-02973-7`。该论文 Data availability 明确将队列 shotgun reads 指向 PRJCA022804。

NGDC 当前项目页面另列两篇 2026 年关联论文，不能仅据此把它们当作本地每张派生矩阵的方法来源。团队仍需提供：

1. 选择 AD/NC 的依据，是否另有排除或质控规则。
2. 匿名受试者 ID 或独立采样确认，以及 `HPC_Batch`、`Group` 的准确含义。
3. 实际输入文件、最终 shell 脚本、运行日志/环境版本、数据库版本、关键参数、丰度单位及标准化方法。本次已收到历史脚本归档和软件版本清单，完成[补充核对](bioinformatics-script-provenance.md)；实际执行关联仍待补。

后续服务器转交文件已补齐部分 MAG 成功运行证据，但当前物种 Excel 与服务器表存在特征/数值差异，最新生成过程缺项见[服务器转交核对](server-transfer-audit.md)。上述官方样本身份核对结论不受该数值差异影响。

## 复现整理

脚本：[organize-ngdc-metadata.py](../../scripts/organize-ngdc-metadata.py)，依赖 openpyxl。新核查使用新日期目录，脚本拒绝覆盖既有快照。

```powershell
python scripts/organize-ngdc-metadata.py `
  --official 'C:/Users/xdcai/Downloads/CRA014435.xlsx' `
  --cohort 'G:/project/data/metadata/metadata_NC_AD.csv' `
  --previous 'G:/project/data/metadata/CRA014435.xlsx' `
  --observations 'docs/reference/ngdc-source-observations-2026-10-01.json' `
  --output 'backend/storage/provenance/CRA014435/NEW-SNAPSHOT'
```

官方工作表的声明尺寸只有 A1，普通流式读取可能误读为一行；整理脚本使用正常读取模式，实际验证三个工作表的数据行数。网页记录仅适用于所标注的核查日期；新下载时应重新核查并提供对应记录。
