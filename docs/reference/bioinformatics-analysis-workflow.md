# AD 宏基因组生物信息分析流程摘要

本文归纳自生物信息分析同学提供的《AD宏基因组生物信息分析流程》，用于帮助 AD-Meta 的开发者和 Agent 理解分析数据的上游来源、科学含义和未来扩展方向。

生物信息分析流程在本仓库之外独立开发。AD-Meta 不负责执行 FASTQ 质控、序列组装、分箱或功能注释，只接收经过整理和校验的结构化分析结果。

## 1. 研究输入与共同预处理

原始数据来自 NCBI SRA、ENA、GEO 等公共数据库中的 AD、MCI 和健康对照宏基因组测序样本。样本元数据应包括样本编号、疾病分组、样本类型、测序平台、年龄和性别等信息。

双端 Raw FASTQ 首先经过统一预处理：

```text
Raw FASTQ
  → FastQC / MultiQC 质量评估
  → fastp 去接头、低质量和过短序列
  → Bowtie2 / KneadData 去除宿主污染
  → Clean Reads
```

质量控制结果可整理为样本级 QC 汇总，记录测序深度、过滤前后 Reads 数量、Q20/Q30、GC 含量和宿主去除比例。Clean Reads 是后续 Reads 水平分析和组装分析的共同输入。

> 工具边界：当前 AD-Meta 尚未接入原始测序文件和 QC 汇总，也不应在页面中暗示能够在线运行上述流程。

## 2. Reads 水平物种组成分析（分析矩阵已接入）

该方向直接对 Clean Reads 进行微生物分类，用于比较 AD 与健康对照之间的群落组成和物种丰度。

```text
Clean Reads
  → Kraken2 物种分类
  → Bracken 丰度校正
  → Sample × Species 物种丰度矩阵
```

`Sample × Species` 中每行代表一个样本，每列代表一个微生物物种，数值表示该物种在对应样本中的丰度。该矩阵是当前“群落物种”分析域的数据基础，支持：

- 丰度与组成概览。
- AD/NC 组内分布和组间差异分析。
- 门、纲、属、物种分类层级可视化。
- PCA、PCoA 等样本结构分析。

## 3. 组装水平宏基因组分析

Clean Reads 使用 MEGAHIT 进行 de novo 组装，获得 Contigs；组装质量可由 QUAST 或 MetaQUAST 评估。

```text
Clean Reads
  → MEGAHIT
  → Contigs
  → QUAST / MetaQUAST 组装质量评价
```

组装质量指标通常包括 Contig 数量、总长度、N50 和 GC 比例。Contigs 随后进入群落整体功能分析和 MAG 重建两个方向。

### 3.1 群落整体功能分析（分析矩阵已接入）

该方向回答“整个微生物群落具有哪些功能”，不能直接回答某项功能由哪个具体物种提供。

```text
Contigs
  → Prodigal 基因预测
  → eggNOG-mapper / KofamScan / DIAMOND + KEGG 功能注释
  → Clean Reads 回比预测基因集合
  → Bowtie2 / CoverM / Salmon 丰度定量
  → 按 Gene-KO 对应关系汇总
  → Sample × KO 功能丰度矩阵
```

功能注释可包含 KO、COG、GO、EC 和 KEGG Pathway 等信息。当前工具接入的是 `Sample × KO` 矩阵：每行代表一个样本，每列代表一个 KO 功能编号，数值表示该功能在样本中的丰度。

该矩阵是当前“群落功能”分析域的数据基础，支持 KO 组成、检出情况和组间差异分析。后续可以增加 KEGG Pathway 或 Module 解释，但不得将群落层面的 KO 相关性表述为具体物种的功能归属。

### 3.2 Genome-resolved Metagenomics（部分接入）

该方向从组装结果中恢复 MAG（Metagenome-Assembled Genome）。当前工具已接入 872 个去冗余代表 MAG 的 Sample × MAG 丰度、GTDB 分类和 CheckM2 质量；MAG 功能注释和独立跨队列复现仍未接入。

规划流程为：

```text
Contigs
  → Clean Reads 回比 Contigs
  → Bowtie2 / CoverM 计算 Contig coverage
  → MetaBAT2 / SemiBin2 / MetaDecoder 分箱
  → MAGScot / DAS Tool 优化整合
  → CheckM2 质量评价
  → dRep 按 ANI 去冗余
  → Final MAGs
```

分箱综合利用 Contig 的序列组成特征和跨样本 Coverage 模式。CheckM2 用于评价完整度、污染度和基因组大小；dRep 用于去除重复或高度相似的基因组。

## 4. MAG 水平解析

经过质量筛选和去冗余的 Final MAGs 可形成四类下游分析；以下同时注明当前工具接入边界。

### 4.1 分类与系统发育

```text
Final MAGs
  → GTDB-Tk 分类
  → IQ-TREE 系统发育分析
  → iTOL 可视化
  → MAG × Taxonomy
```

GTDB 分类层级已经接入；IQ-TREE/iTOL 系统发育结果尚未作为稳定数据产品接入。

### 4.2 MAG 丰度

```text
Final MAGs + Clean Reads
  → Bowtie2 回比
  → CoverM 丰度计算
  → Sample × MAG
```

Sample × MAG 相对丰度已经接入，可用于当前 CRA014435 AD/NC 子队列的探索性组间比较。

### 4.3 MAG 功能注释

```text
Final MAGs
  → Prodigal / Bakta 基因预测
  → eggNOG / KofamScan / DRAM 功能注释
  → MAG × KO
```

与群落层面的 `Sample × KO` 不同，`MAG × KO` 可用于描述具体 MAG 携带的功能，是后续讨论功能归属的必要数据基础。

### 4.4 特殊功能注释

- ARG：使用 CARD/RGI 分析抗生素抗性基因。
- CAZyme：使用 dbCAN 分析碳水化合物活性酶。
- BGC：使用 antiSMASH 预测生物合成基因簇。
- 代谢与蛋白功能：使用 DRAM、MEROPS 等工具进行补充注释。

这些结果用于分析微生物潜在代谢能力和疾病相关功能；在正式分析数据接入前，工具不得展示模拟结论。

## 5. 分析数据与接入状态

| 分析数据 | 科学含义 | 当前状态 | 对应分析域 |
| --- | --- | --- | --- |
| Sample × Species | 样本中的物种丰度 | 已接入 | 群落物种 |
| Sample × KO | 样本中的群落整体 KO 丰度 | 已接入 | 群落功能 |
| Final MAGs / MAG Quality | 质量筛选、优化和去冗余后的代表 MAG 与 CheckM2 指标 | 已接入 872 个 | MAG 解析 |
| MAG × Taxonomy | GTDB 分类信息；系统发育树尚未接入 | 分类已接入 | MAG 解析 |
| Sample × MAG | 样本中的 MAG 丰度 | 已接入 185×872 | MAG 解析 |
| MAG × KO | 每个 MAG 携带的 KO 功能 | 规划中 | MAG 解析、物种-功能联合 |
| ARG / CAZyme / BGC 等 | MAG 的特殊功能注释 | 规划中 | MAG 解析 |

## 6. 对 AD-Meta 开发的约束

1. 页面上的“群落物种”和“群落功能”是两个分析域，不应把两张导入矩阵误称为两个正式研究数据集。
2. 物种和 KO 数据可以覆盖不同的样本子集，所有图表必须使用当前分析矩阵实际包含的样本数和 AD/NC 分组数。
3. `Sample × KO` 只描述群落整体功能；没有 `MAG × KO` 或其他可靠归属证据时，不得声称功能来自某个具体物种。
4. MAG 模块必须按数据就绪度逐项启用；未接入的功能注释和跨队列复现继续保持禁用或“规划中”状态。
5. 新增分析数据类型时，应先定义导入契约、数据库模型和后端预计算，再注册前端分析模块；不得在页面组件中直接拼接原始分析文件。

## 7. 整体数据流

```text
Raw FASTQ
  → 质量控制、过滤和宿主去除
  → Clean Reads
     ├─ Reads 水平分类与丰度校正
     │    └─ Sample × Species → AD-Meta 群落物种分析
     └─ Assembly
          ├─ 基因预测、功能注释和 Reads 定量
          │    └─ Sample × KO → AD-Meta 群落功能分析
          └─ Coverage、Binning、质量评价和去冗余
               └─ Final MAGs
                    ├─ MAG × Taxonomy
                    ├─ Sample × MAG
                    ├─ MAG × KO
                    └─ ARG / CAZyme / BGC 等特殊功能数据
```
