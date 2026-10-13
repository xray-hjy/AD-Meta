# GMrepo 固定版本运行数据包

[`gmrepo-2026-10-09-v1.zip`](gmrepo-2026-10-09-v1.zip) 随源码提供，大小 634,714 字节（约 620 KiB），解压后 6,618,368 字节。包内 14 个文件足以运行当前 GMrepo 概览、样本、菌属分布、身份审查、探索性统计和来源 LDA 对照。

在仓库根目录运行 `npm run setup:gmrepo`；后端启动命令也会自动安装默认目录。Windows 可以运行 `.\Start-ADMeta.ps1 gmrepo`。完整安装、校验及故障处理见 [GMrepo 接入说明](../docs/reference/gmrepo.md)。

也可用 Python 标准库独立安装，不依赖 Node、MySQL 或后端第三方库：

```powershell
python backend/app/cli/install_gmrepo.py --destination "ADMetaData/reference/gmrepo/processed/2026-10-09-v1"
```

## 完整性与交付范围

- ZIP SHA-256：`23172b1bba7ba9c71bb77f9610bfeb27bcac99f18919f82ed48d256825e3b87d`。
- 原 `processing_manifest.json` fingerprint：`68f003174b519a9aa8ec401a8e42223bf9e4b67aa26fe4b370b4b5b2e33f2971`。
- [交付清单](gmrepo-2026-10-09-v1.json) 记录 ZIP 校验值及每个交付文件的路径、字节数和 SHA-256。所有数据文件与原处理清单逐字节一致，未重算或重新筛选。
- 除基础 8 文件，包内还包含 `tables/source_marker_evidence.tsv` 与身份审查登记依赖的 5 个证据文件。只复制基础文件不能恢复完整的统计及来源证据功能。
- 原处理清单仍记录完整科研处理目录的 119 个文件。当前运行包只交付其中 13 个文件及该原清单，保留原 fingerprint；原快照、作者 RDS、重处理脚本和重复的队列矩阵需要完整科研归档，不能用运行包重跑原处理管道。
- 数据继续安装在被 Git 忽略的 `ADMetaData/reference/gmrepo/processed/` 下，只读加载，独立于物种 / KO / MAG 主数据。已有完整本地包可直接通过校验，其他文件不会被删除。

## 来源与引用

数据来源和原值字段保留在包内 `data_contract.json`、`cohort_rules.json`、样本元数据及原处理清单中。测序 Run 与研究内伪匿名编号均来自公开研究记录；本包没有补充姓名、联系方式或新的受试者身份信息。

| 来源 | 本包用途与记录 |
| --- | --- |
| [GMrepo](https://gmrepo.humangut.info/)；[GMrepo v3 数据可用性说明](https://pmc.ncbi.nlm.nih.gov/articles/PMC12807640/) | 原参考队列元数据、来源相对丰度与 LDA。输入快照为 `2026-10-08`，保留原尺度、缺失值和来源旧分类名，引用原数据库与各原研究。 |
| [ENA PRJEB51982](https://www.ebi.ac.uk/ena/browser/view/PRJEB51982) | 原公共样本 XML，用于研究内参与者对应；XML 原样保留。 |
| Vogt 等，[Gut microbiome alterations in Alzheimer’s disease](https://pmc.ncbi.nlm.nih.gov/articles/PMC5648830/)（2017） | 原文 XML，用于确认队列设计；保留原作者、版权及 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可声明，未修改原文。 |
| Troci 等，[Disease- and stage-specific alterations of the oral and fecal microbiota in Alzheimer's disease](https://pmc.ncbi.nlm.nih.gov/articles/PMC10776369/)（2023） | 原文 XML，用于疾病阶段和身份依据；保留原作者、版权及 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可声明，未修改原文。 |
| [trocialba/Alzheimer-Project](https://github.com/trocialba/Alzheimer-Project/tree/bb111d840710a7b93fb5b38996d1b54a46f77af1) | 固定该 commit 的公开粪便元数据提取结果及本项目提取脚本。只提取分组、研究内编号和必要协变量，保留来源与原码；原 RDS 不随运行包提供。 |

第三方内容保留原来源的权利和许可声明，不因封装成为本项目原创数据。使用本包进行研究时应引用 GMrepo 和对应原研究。Run 数量不等于已验证的独立参与者人数；统计资格与解释边界见 [科学口径](../docs/reference/gmrepo.md#科学口径)。
