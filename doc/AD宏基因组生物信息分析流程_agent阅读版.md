---
title: AD 宏基因组生物信息分析流程（Agent 阅读版）
source: E:/Softwares/微信/聊天记录/xwechat_files/wxid_watnnmt953jh22_dc47/msg/file/2026-07/AD宏基因组生物信息分析流程.docx
purpose: 说明 AD 宏基因组分析的数据来源、处理路径、文件产出及数据语义
status: 基于源 DOCX 结构化整理；仅“Read-based 物种组成分析”和“群落整体功能分析”被源文档明确标记为已完成
---

# AD 宏基因组生物信息分析流程

> 本文档记录从原始宏基因组测序数据到物种、群落功能、MAGs 及特殊功能注释的完整分析路径。它描述数据产品及其来源，不等同于 AI 生物标志物挖掘方案。

## 1. 数据来源与统一输入

### 数据来源与元数据

原始宏基因组测序数据主要来自 NCBI SRA、ENA、GEO 等公共数据库。根据研究需求收集健康组、MCI 组和 AD 组数据，并同步整理样本元数据，包括样本编号、疾病分组、样本类型、测序平台、年龄和性别等信息。

### 原始测序数据

典型输入为 Illumina 双端测序文件：

```text
sample_R1.fastq.gz
sample_R2.fastq.gz
```

### 质量控制与预处理

处理路径：

```text
Raw FASTQ → FastQC / MultiQC 质量评估 → fastp 过滤 → Bowtie2 或 KneadData 去宿主 → Clean Reads
```

- **FastQC / MultiQC**：检查 Reads 质量分布、GC 含量、序列长度和接头污染。
- **fastp**：去除接头序列、低质量 Reads 和过短序列。
- **Bowtie2 或 KneadData**：去除人体宿主来源 DNA。

产出：

```text
clean_R1.fastq.gz
clean_R2.fastq.gz
qc_summary.tsv
```

`qc_summary.tsv` 记录样本测序深度、过滤前后 Reads 数量、Q20/Q30 比例、GC 含量及宿主去除比例。Clean Reads 是后续全部分析模块的统一输入。

---

## 2. Read-based 物种组成分析【已完成】

### 分析目的

直接基于 Clean Reads 进行微生物分类，比较 AD 患者与健康人群的微生物群落组成和物种丰度变化。

### 处理路径

```text
Clean Reads → Kraken2 物种分类 → Bracken 丰度校正 → Species abundance matrix
```

- **Kraken2**：根据 Reads 与参考数据库的匹配关系确定分类信息。
- **Bracken**：对分类结果进行丰度校正，提高物种水平丰度估计的准确性。

### 已完成数据产品

```text
AD&NC_species_abundance.xlsx
```

数据结构为 `Sample × Species`：行代表样本，列代表微生物物种，数值代表对应物种在样本中的相对丰度。

应用包括 AD 与健康组菌群组成比较、差异物种分析及物种丰度可视化。

---

## 3. Assembly-based 宏基因组组装分析

### 分析目的

将 Clean Reads 拼接为较长 DNA 片段（Contigs），为群落整体功能分析和 MAGs 重建提供基础。

### 处理路径与产出

```text
Clean Reads → MEGAHIT de novo 组装 → Contigs
```

主要文件：

```text
contigs.fa
assembly_statistics.tsv
```

使用 QUAST 或 MetaQUAST 进行组装质量评价。`assembly_statistics.tsv` 记录 Contig 数量、总长度、N50 和 GC 比例等指标。

`contigs.fa` 是后续群落整体功能分析与基因组解析宏基因组分析的共同输入。

---

## 4. Community-level Functional Profiling（群落整体功能分析）【已完成】

### 分析目的

描述整个微生物群落具备的功能组成及其在不同组别之间的潜在变化；该结果不直接判定某项功能来自哪一个具体微生物。

### 处理路径

```text
Contigs.fa → Prodigal 基因预测 → 功能注释 → Reads 定量 → KO 丰度矩阵
```

具体过程：

1. 使用 Prodigal 进行基因预测，获得 `genes.fna`、`proteins.faa` 和 `genes.gff`。
2. 使用 eggNOG-mapper、KofamScan、DIAMOND + KEGG 等进行功能注释，生成 `gene_annotation.tsv`。
3. 将 Clean Reads 回贴至预测基因集合，使用 Bowtie2、CoverM 或 Salmon 计算功能基因丰度。
4. 根据 Gene 与 KO 的对应关系汇总到 KO 功能层级。

`gene_annotation.tsv` 可记录基因对应的 KO、COG、GO、EC 和 KEGG pathway 等信息。

### 已完成数据产品

```text
ko_abundance_ad.csv
```

数据结构为 `Sample × KO`：行代表样本，列代表 KO 功能编号，数值代表对应功能在样本中的丰度。

应用包括 AD 与健康组的功能差异分析、KEGG 通路分析及功能水平可视化。

---

## 5. Genome-resolved Metagenomics（MAGs 重建）

### 分析目的

从宏基因组组装结果中恢复单个微生物基因组，得到 MAGs（Metagenome-Assembled Genomes）。

### 处理路径

```text
Contigs → Coverage 计算 → Genome Binning → Bin 优化 → MAG 质量评价 → dRep 去冗余 → Final MAGs
```

### 主要步骤与文件

1. **Coverage 计算**：将 Clean Reads 回贴至 Contigs，使用 Bowtie2 生成 BAM 文件，再用 CoverM 计算 Contig 覆盖度。

   ```text
   contig_depth.tsv
   ```

2. **Genome Binning**：依据 Contig 的 GC 含量、k-mer 组成和跨样本 Coverage 模式，使用 MetaBAT2、SemiBin2、MetaDecoder 等工具获得初始 Bin。

3. **Bin 优化整合**：通过 MAGScot 或 DAS Tool 整合多个分箱结果，提高 MAG 恢复质量。

4. **质量评价与去冗余**：使用 CheckM2 评价完整度、污染度和基因组大小，生成：

   ```text
   MAG_quality.tsv
   ```

   之后使用 dRep 基于 ANI 去除重复或高度相似的基因组。

最终得到：

```text
Final MAGs
```

Final MAGs 是后续 MAGs 分类、丰度和功能解析的核心输入。

---

## 6. MAGs 水平解析

### 6.1 MAGs 分类与系统发育分析

```text
Final MAGs → GTDB-Tk 分类 → IQ-TREE 系统发育分析 → iTOL 可视化
```

产出：

```text
MAG_taxonomy.tsv
```

该文件记录每个 MAG 的分类层级信息（Domain 至 Species）。最终形成 `MAG × Taxonomy` 数据，用于描述 MAG 之间的分类关系和系统发育关系。

### 6.2 MAGs 丰度分析

```text
Final MAGs + Clean Reads → Bowtie2 比对 → CoverM 丰度计算 → MAG abundance matrix
```

产出：

```text
mag_abundance.tsv
```

数据结构为 `Sample × MAG`，用于比较 AD 组与健康组中不同 MAG 的存在情况及丰度变化。

### 6.3 MAGs 功能注释分析

```text
Final MAGs → 基因预测 → 功能注释 → MAG 功能矩阵
```

使用 Prodigal 或 Bakta 预测 MAG 编码基因，并使用 eggNOG、KofamScan、DRAM 等进行功能注释。

产出：

```text
MAG_KO.tsv
```

数据结构为 `MAG × KO`，用于描述不同 MAG 携带的功能信息。

---

## 7. 特殊功能分析

以下分析均以 Final MAGs 为输入：

| 分析方向 | 处理路径 | 产出文件 | 作用 |
| --- | --- | --- | --- |
| 抗生素抗性基因（ARG） | `Final MAGs → CARD/RGI → ARG 注释` | `ARG_annotation.tsv` | 分析不同 MAG 携带的抗性基因 |
| 碳水化合物活性酶（CAZyme） | `Final MAGs → dbCAN → CAZyme 注释` | `CAZyme_annotation.tsv` | 分析微生物碳水化合物代谢能力 |
| 生物合成基因簇（BGC） | `Final MAGs → antiSMASH → BGC 预测` | `BGC_annotation.tsv` | 分析微生物次级代谢产物合成潜力 |
| 代谢功能 | `Final MAGs → DRAM / MEROPS → 功能注释` | `Functional_annotation.tsv` | 分析微生物代谢能力及潜在疾病相关功能 |

---

## 8. 核心数据产品汇总

| 数据产品 | 产物文件 | 来源流程 | 数据语义与主要用途 |
| --- | --- | --- | --- |
| `Sample × Species` | `AD&NC_species_abundance.xlsx` | Kraken2 + Bracken | 群落层面的样本—物种相对丰度；用于 AD/NC 菌群组成比较和物种差异分析。 |
| `Sample × KO` | `ko_abundance_ad.csv` | 组装、基因预测、功能注释、Reads 定量 | 群落层面的样本—KO 功能丰度；用于功能变化与通路研究。 |
| Final MAGs | `Final_MAGs.fa` | 组装 → Coverage → Binning → MAG 优化 → CheckM2 → dRep | 恢复得到的 MAGs 集合。 |
| `MAG × Taxonomy` | `MAG_taxonomy.tsv` | GTDB-Tk | MAGs 分类及系统发育分析。 |
| `Sample × MAG` | `mag_abundance.tsv` | Bowtie2 + CoverM | 样本—MAG 丰度关系；用于 MAGs 分布和组间比较。 |
| `MAG × KO` | `MAG_KO.tsv` | MAGs 基因预测与功能注释 | 每个 MAG 携带的功能信息。 |
| 特殊功能数据 | `ARG_annotation.tsv`、`CAZyme_annotation.tsv`、`BGC_annotation.tsv` | CARD、dbCAN、antiSMASH 等 | 解析 MAGs 的抗性、碳水化合物代谢和次级代谢潜力。 |

> 数据语义提醒：`ko_abundance_ad.csv` 是**群落整体**的 `Sample × KO` 功能丰度表；`MAG_KO.tsv` 是**MAGs 层面**的 `MAG × KO` 功能注释表，二者不能混为同一张 KO 丰度表。`AD&NC_species_abundance.xlsx` 同样属于分箱前/群落层面的物种丰度结果，而非 MAG 丰度结果。

---

## 9. 整体数据流

```text
Raw FASTQ
  → 质量控制与预处理
  → Clean Reads
  ├─ Read-based 物种分析
  │    → Sample × Species
  └─ Assembly-based 分析
       → Contigs
       ├─ 群落整体功能分析
       │    → Sample × KO
       └─ Genome-resolved Metagenomics
            → Final MAGs
            → 分类、丰度、功能及特殊功能注释
            → 标准化数据产品
            → 后续统计分析与前端可视化系统
```
