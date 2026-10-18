# AD/NC DiTing 功能结果

当前来源是同一批 PRJCA022804 / CRA014435 的 185 个 AD/NC 样本（AD 122、NC 63）。样本标签由 `../../ad-nc-species/PRJCA022804/samples.tsv` 按 CRR 编号关联，不按列位置推断。

| 文件 | 含义 | SHA256 |
| --- | --- | --- |
| ko_abundance_among_samples.tab | DiTing KO 结果，9,537 个标准 KO 与 11 个附加功能基因标识 | fa1123d0a8b202cceb93b09d85a647cf968cf7d6be01783f4b466a83ee366739 |
| pathways_relative_abundance.tab | 同批 DiTing 的 95 项通路及功能指标 | 6086ea9ff401d915a681146dca15da8532928dcc19900abea02b8b033c5da6d2 |
| raw.csv | 历史 KO 输入，保留追溯；不再作为当前导入来源 | 见历史分析版本 |

原始脚本归档位于 `G:/project/scripts/02_diting`。工作流调用 DiTing，读取预处理 reads 和组装结果，产出 KO 与通路表；历史绘图错误不作为结果表接入的阻断项。安装时的精确工具和数据库版本尚未记录。

平台转置标准 KO 并保留原始数值，丰度类型为 normalized_abundance。参考 DiTing 实现按基因覆盖度计算百万尺度丰度并汇总；当前原表不重闭合、不改成百分比。11 个附加标识保留在完整原表下载中，不冒充 KO 编号。

通路结果与 KO、标签快照及 SHA256 共同存入不可变分析版本。通路是 DiTing 的生物地球化学功能指标，可能共享基因，不等同于完整 KEGG 通路集，也不直接代表 AD 机制或临床结论。

通路组间比较：双侧 Mann–Whitney U（渐近法、并列秩校正），效应量 Cliff's delta，正值表示 AD 较高。组内 bootstrap 1,000 次计算 95% 百分位区间，随机种子 20261016；BH 校正覆盖全部 95 项。当前比较仅含疾病分组，未调整其他协变量。
