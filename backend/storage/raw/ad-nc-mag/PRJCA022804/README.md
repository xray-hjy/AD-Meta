# PRJCA022804 / CRA014435 MAG 分析原文件

2026-10-20 从用户整理目录 `G:/project/server_transfer/未整理入档的文件/1020/MAG` 复制归档。
原目录保留。`files.tsv` 记录原路径、归档相对路径、字节数和 SHA-256；复制时逐文件比较原件与副本。
归档日期不代表各工具的运行日期，工具运行时间应读取对应日志或结果文件。

## 管理及导入

- 稳定队列标识：`prjca022804-ad-nc`，与已有物种、群落 KO 共用 CRR 样本身份。
- 输入角色、解析器和模块依赖由 `backend/storage_manifest.json` 的 `cohorts` 声明。
- 执行 `npm run import:cohort -- --dataset prjca022804-ad-nc` 导入数据库，自动生成不可变结果修订及分析记录。
- 实际数据通过硬盘分发；Git 仅保留本说明和文件清单。复制到其他电脑时保留目录结构，无需使用原电脑盘符。
- 部署前用文件清单核对副本；接收新结果时不得覆盖已经归档的不同内容，应存放到新的上游运行子目录并更新显式输入路径。
- `representative_mag_files.txt` 归到 `dRep/`，其余文件保持收到时的相对结构。

## 文件用途

CheckM2、dRep、GTDBTk、CoverM 为质量、成员关系、分类和样本丰度的直接来源。
DRAMMA 的 summary 表优先用于 ARG 导入；候选 FAA、对应表和带 MAG ID 的 pickle 保留作为详细来源附件。
antiSMASH 仅归档 `regions.js` 和区域 GenBank，已提供的记录用于核对区域数量；缺少记录不会自动视为零 BGC。
IQ_TREE 的最终树用于系统发育拓扑展示；iTOL 是另外保存的衍生展示资料。

本次没有搬入最终 MAG 全序列、dRep Mdb、大型工具数据库及 DRAM2 正在运行的结果。
这些不是本次可视化结果导入的必需输入，后续可按实际产出独立补充。

## 语义

- CoverM 百分比保留原值，不把代表 MAG 的行和重归一化为 100%。
- CheckM2 全体候选、dRep 筛选成员和代表 MAG 分别记录，不混用统计分母。
- DRAMMA 的 HMM 命中、模型候选、prob 和 passed 标记分别保留；候选不是已验证耐药基因或耐药表型。
- BGC 表示基因簇合成潜力，系统发育树不等同于热图的丰度聚类树。
- 不从群落 KO 表生成未经证据支持的 MAG→KO 关联；不默认把 GTDB 名称对应到 MetaPhlAn 特征。

该导入流程不读取历史 MAG 交付包。
