# 队列共用样本资料

`metadata_NC_AD.csv` 于 2026-10-20 从独立来源 `G:/project/data/metadata/metadata_NC_AD.csv` 原样复制。
用于样本别名、SAMC、年龄、性别、来源组及 HPC 批次，不由历史 MAG 交付包生成。

疾病分组以 `ad-nc-species/PRJCA022804/samples.tsv` 的已核对标签为准；导入按 CRR 编号关联，两个来源的疾病标签必须一致。
来源核对记录见 `docs/guides/ngdc-metadata-verification.md`；本地已归档的官方对应表位于
`backend/storage/provenance/CRA014435/2026-10-01/`。

年龄、性别等缺失时保留缺失，不插补。HPC_Batch 是处理批次，Group 是来源组，不作为疾病标签或独立外部队列。
原始文件 SHA-256 随每次数据集导入记录保存。该小文件与说明提交 Git，供各分析模块共用。
