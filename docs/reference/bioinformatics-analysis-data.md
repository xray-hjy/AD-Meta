# 生物信息流程与分析数据接入

本文用于约束前端分析模块、后端导入契约和科学表述。完整上游步骤见[《AD 宏基因组生物信息分析流程摘要》](bioinformatics-analysis-workflow.md)。生物信息分析流程在本仓库外独立开发，AD-Meta 不执行 FASTQ 质控、组装、分箱或注释工具。

## 共同数据基础

公开数据库中的 AD、MCI 和健康对照宏基因组测序数据经过质量评估、低质量序列过滤和宿主污染去除后形成 Clean Reads。Clean Reads 是后续物种组成、群落功能和 MAG 重建的共同输入。

AD-Meta 只接收生物信息分析流程整理后的结构化分析结果，不读取 FASTQ、BAM、Contig 或分析工具的临时文件。

## 当前 CRR 队列的官方来源

### 官方项目身份

当前 185 个 CRR 样本来自国家基因组科学数据中心（NGDC）GSA 项目 [CRA014435](https://ngdc.cncb.ac.cn/gsa/browse/CRA014435)，对应 BioProject [PRJCA022804](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804)。项目标题为 **Metagenomic analysis characterizes stage-specific gut microbiota in Alzheimer's Disease**。

官方项目包含 476 名受试者，队列构成为：

| 临床分组 | 样本数 |
| --- | ---: |
| NC | 63 |
| SCS | 82 |
| SCD | 90 |
| MCI | 119 |
| AD | 122 |
| 合计 | 476 |

### 当前 185 个样本的范围

本地 KO 矩阵和当前 MAG 定量产物均包含 185 个 CRR 样本，其中 AD 122 个、NC 63 个，数量与官方项目中的 AD 和 NC 两组完全一致。因此当前系统使用的是 **CRA014435 项目的 AD/NC 子队列**，不是一个官方命名为“CRR185”的独立数据集。

推荐表述：

- 页面名称：`当前 AD/NC 分析结果`
- 数据来源说明：`CRA014435（PRJCA022804）AD/NC 子队列，n=185`
- 内部技术标识可以使用 `cra014435_ad_nc_185`，但不得把它写成官方数据集名称。

这是依据官方项目统计和本地分组标签进行的交叉核对。后续接入完整临床元数据后，应继续校验每个样本的诊断分组，而不能只依赖样本数量相等。

### 编号层级与样本身份

GSA 中各编号的含义如下：

| 编号前缀 | 含义 |
| --- | --- |
| PRJCA | BioProject，项目级身份 |
| CRA | GSA study，研究数据集身份 |
| SAMC | BioSample，生物样本身份 |
| CRX | Experiment，测序实验身份 |
| CRR | Run，测序运行身份 |

CRR 是测序运行编号，不等同于受试者身份。后端导入和 Manifest 必须保存 `CRR -> CRX -> SAMC -> 样本别名 -> 临床分组` 的映射；若同一受试者包含多个 run，还必须保存受试者级稳定 ID，避免把 run 数误当成样本数。

### 测序信息

官方项目登记的数据类型为人粪便宏基因组全基因组鸟枪法测序，测序平台为 Illumina NovaSeq 6000，双端 150 bp。这里记录的是项目级测序信息；具体 run 的文件大小、校验值和下载地址应以 GSA run 清单为准。

### 关联论文与下载入口

项目页面当前关联的论文包括：

1. [Impacts of host genetics on gut microbiome composition in Alzheimer's disease](https://doi.org/10.1186/s40168-026-02342-8)，*Microbiome*，2026；[PubMed 41782023](https://pubmed.ncbi.nlm.nih.gov/41782023/)。
2. [Multi-omics profiling reveals gut microbiome signatures associated with cognitive decline in Alzheimer's disease](https://doi.org/10.1016/j.isci.2026.116622)，*iScience*，2026。

下载与保存规则：

- 原始数据、run 清单和项目元数据从 [GSA CRA014435](https://ngdc.cncb.ac.cn/gsa/browse/CRA014435) 获取。
- 项目和样本级元数据从 [BioProject PRJCA022804](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA022804) 及其关联 BioSample 页面核对。
- 论文优先通过 DOI 页面、PubMed 或出版社提供的开放获取入口下载。
- 仓库只保存论文题录、DOI、项目编号和必要的可复现说明；除非许可明确允许，不把论文 PDF 直接提交到 GitHub。
- “项目关联论文”不自动等于每张本地派生矩阵的直接方法来源。每份矩阵仍需由生信组提供生成命令、软件版本、参数和输入样本清单。

### 后续接入必须保留的信息

接入新的物种、KO 或 MAG 结果时，Manifest 至少应包含：

- `project_accession`: `PRJCA022804`
- `study_accession`: `CRA014435`
- 精确的 CRR 样本清单及其数据修订版本
- CRR、CRX、SAMC、样本别名、受试者 ID 和临床分组映射
- 纳入与排除规则，以及 AD/NC 子队列形成方式
- 测序平台、读长、单双端信息
- 上游软件、版本、参数和参考数据库版本
- 丰度或覆盖度指标的定义、单位、零值规则和归一化方式
- 关联论文 DOI 和方法引用

## 当前已接入的分析数据

### Sample x Species

该矩阵来源于 Clean Reads 的 Reads 水平分类和丰度校正结果：

```text
Clean Reads -> Kraken2 分类 -> Bracken 丰度校正 -> Sample x Species
```

当前发布范围限定为 CRA014435 的 185 个 CRR AD/NC 样本（AD 122、NC 63）。
原始交付表中的 ERR 与 SRR 行保留用于来源审计，但不会进入当前物种数据集、缓存或分析运行。

它支持群落物种组成概览、AD/NC 物种分布与差异分析、分类层级关系可视化，以及基于物种矩阵的样本结构与距离分析。

### Sample x KO

该矩阵来源于组装、基因预测、功能注释和 Reads 定量结果：

```text
Clean Reads -> Assembly -> 基因预测与功能注释 -> Reads 定量 -> Sample x KO
```

当前发布范围同样为上述 185 个 CRR AD/NC 样本。

它描述群落整体功能组成，支持 KO 丰度、检出情况和组间差异分析，并可继续扩展 KO 到 KEGG Pathway 或 Module 的解释。`Sample x KO` 不能单独证明某项功能来自某个具体物种。

## MAG 分析数据与接入状态

基因组解析宏基因组流程计划形成以下结构化分析结果：

- Final MAGs：经分箱、质量评价和去冗余获得的基因组集合。
- MAG x Taxonomy：MAG 分类层级和系统发育信息。
- Sample x MAG：不同样本中的 MAG 丰度。
- MAG x KO：不同 MAG 携带的功能信息。
- ARG、CAZyme、BGC 和代谢功能注释结果。

### 已接入的 CRR MAG 数据

生信组已交付 185 个 CRR 样本与 872 个 MAG 的 CoverM 定量结果，包括相对丰度、平均覆盖深度、被 reads 覆盖的基因组比例、比对 reads 数和 reads/base，并同时提供宽表与统一长表。原始文件归档于：

```text
backend/storage/raw/crr-mag-quantification/
```

当前运行版本 `mag_v2` 已将 Sample × MAG 丰度、GTDB-Tk 分类和 CheckM2 质量通过同一组 872 个代表 MAG ID 关联，并在 `/analysis/mag` 提供丰度、分类、质量和技术质控视图。运行时只读版本化 `development_input`，不直接读取生信源目录。

MAG × KO、ARG、CAZyme、BGC 等功能注释尚未交付为可关联的数据产品；当前 185 个样本又都来自 CRA014435 的 AD/NC 子队列，因此 MAG 功能注释和独立跨队列复现仍必须标记为“规划中”，不得展示模拟结果。GTDB-Tk 与 GTDB reference release 版本也仍需补充到来源清单。

## 前端分析域约定

分析工作区按科学问题组织为四个稳定分析域：

1. 群落物种：组成概览、分布与差异、分类层级、样本结构。
2. 群落功能：功能概览、检出与差异、样本结构、通路解释。
3. 物种-功能联合：规划中的样本层面关联分析；相关关系不得表述为功能归属。
4. MAG 解析：已接入丰度、GTDB 分类、CheckM2 质量和技术质控；功能注释与独立跨队列复现规划中。

分析域是长期信息架构。新增分析数据类型时，应扩展导入契约、数据库模型、后端预计算和图表注册配置，不应在页面组件中临时拼接数据或增加孤立入口。
