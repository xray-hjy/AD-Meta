# 生信脚本归档与版本证据核对

核查日期：2026-10-01。输入为用户提供的 `G:/project/AD_shell_scripts_archive/AD_shell_scripts_archive` 及本次软件版本清单。用户同日进一步确认 MAG 功能注释尚未做完，状态为待完成。

后续同日收到 `server_transfer` 新批次，已补齐 CoverM 成功链路、CheckM2 成功日志、GTDB-Tk 实际命令及更多源表。本文保留历史脚本归档的核查范围；最新缺项以[服务器转交文件核对](server-transfer-audit.md)为准。

## 1. 当前能确认到哪里

公开样本来源和 185 个样本的对应已在[NGDC 核对报告](ngdc-metadata-verification.md)确认。本次进一步整理“哪些脚本可能生成哪些产物、有哪些参数、版本证据来自哪里”。

现有平台已经收到并校验物种、群落 KO，以及 MAG 丰度、分类、质量、去冗余关系。此历史脚本归档中未找到 MAG 功能结果表和最终系统发育树；同日后续服务器转交已收到 GTDB 分类定位树，独立 IQ-TREE 结果仍待确认。MAG 功能注释按用户确认标为待完成，完成后交付正式结果和运行记录；已有群落 KO 的来源资料待补充。各分析分支的进度分别登记。

**脚本、安装版本、成功运行记录、实际产物是四种不同证据。** 脚本可以确定写了什么命令；只有运行日志、环境记录和输入输出校验值才能把命令准确关联到本机使用的结果。

## 2. 归档完整性

已逐文件核对归档自带的 `归档溯源.json`，无校验值冲突、无登记文件缺失；31 个文件完整复制到 `backend/storage/provenance/bioinformatics/2026-10-01/archive/`，复制前后字节一致。

| 类别 | 文件数 | 能提供的证据 |
| --- | ---: | --- |
| 独立脚本附件 | 9 | MEGAHIT、分箱、CheckM/CheckM2、dRep 的历史脚本内容 |
| 参考附件 | 16 | 内容完全相同的一份 1—14 步命令示例 |
| 历史终端记录 | 2 | IQ-TREE、CoverM 的旧命令和报错 |
| 归档说明与校验文件 | 4 | 历史来源登记、目录、校验值 |

25 个 `.sh` 按 SHA-256 去重后是 **10 份不同内容**。详细清单见[脚本登记表](../../backend/storage/provenance/bioinformatics/2026-10-01/script_inventory.tsv)和[归档核对结果](../../backend/storage/provenance/bioinformatics/2026-10-01/archive_catalog.json)。

归档目录本身说明：未连接服务器核对最终文件，独立附件含早期和备选方案，参考附件包含未定义变量。归档中的“已完成”是历史登记者的陈述，本次没有服务器运行记录来逐项复核。部分中文注释已有乱码，字节保持原样。

## 3. 步骤、参数与当前交付的关系

下表沿用归档参考脚本的 1—14 步编号；群落物种和群落 KO 是流程文档中的另外两条产物线，不应因下表没有其正式脚本而认定没做过。

| 步骤 | 本次读到的脚本/记录 | 可读到的配置 | 关键产物与证据范围 |
| --- | --- | --- | --- |
| 1—2 下载与质控 | 只有参考命令 | prefetch/fasterq-dump、FastQC/MultiQC、fastp；fastp 示例含 Q20、最短 50 bp、去重等 | 原始/clean reads、QC 报告；缺实际下载、质控和去宿主脚本及报告，无法证明实际输入 |
| 3 组装 | 三份 MEGAHIT 独立附件 | `meta-sensitive`、最短 contig 1,500 bp；36 线程；`samplelist_CRR.txt` | 各样本 contigs；样本表原件、最终服务器脚本与成功日志未提供 |
| 4 contig 回比 | 只有 Bowtie2 参考命令 | 双端回比、SAMtools 排序与建索引 | BAM/depth；独立建索引及回比脚本缺失 |
| 5 分箱 | 单工具早期版、三工具版、三工具注释版 | MetaBAT2：2,500 bp、最小 bin 200,000 bp；SemiBin2：global；MetaDecoder：coverage/seed/cluster | 每个样本的初始 bins；版本之间路径与处理方式不同，须确认实际使用版 |
| 6 分箱整合 | 只有 MAGScoT 参考命令 | `--max_cont 1`、`--threshold 0.5` | refined bins；正式整合脚本、标记基因库版本缺失 |
| 7 质量评估 | `run_checkm2_refined_bins.sh`，另有早期汇总脚本 | 从所有 `refined_bins/*.fa` 建软链接；36 线程；默认调用 metabat2_env 的 CheckM2 | quality_report.tsv；已有 MAG v3 质量表，正式结果日志关联待补 |
| 8 筛选与去冗余 | `run_drep_dereplication.sh` | 完整度 ≥50%、污染度 ≤10%；主 ANI 0.90、次 ANI 0.95；fastANI；36 线程；外部 genomeInfo | 代表 MAG、聚类/比较/代表选择表；已有 v3 关联表，实际运行版本仍需日志确认 |
| 9 分类 | GTDB-Tk 参考命令 | `classify_wf --full_tree --skip_ani_screen` | GTDB 分类和标记基因 MSA；v3 分类已交付，正式脚本缺失 |
| 10 系统发育树 | IQ-TREE 历史终端记录 | 细菌：AA、MFP、`-B 1000 -alrt 1000`；古菌旧方案只有 AA/MFP；seed 20260810 | 用户 MAG 的推断树；旧记录报错，无最终成功版和树文件，不能标记已完成 |
| 11 MAG 定量 | CoverM 历史终端记录 | 旧命令读取 clean reads 与代表 MAG；`--mapper strobealign`、`--min-covered-fraction 0`、dense 输出 | mean、relative_abundance、covered_fraction、variance、count、reads_per_base、length；已有 v3 丰度产物，最终成功脚本缺失 |
| 12 BGC 注释 | antiSMASH 参考命令 | bacteria、Prodigal 及 ClusterBlast/MIBiG 等选项 | BGC 注释；历史目录声称此步完成，但本机未交付正式脚本和结果 |
| 13 抗性基因预测 | DRAMMA 参考命令 | Prodigal 产生 faa/gff/ffn；`threshold_list 1e-5`、gene window 20、nucleotide window 20,000 | `.dramma.pkl`；正式脚本、代码 commit、模型/数据库和可读结果表未提供 |
| 14 代谢功能注释 | DRAM 参考命令 | `DRAM-setup.py` 数据库准备与 `DRAM.py annotate` | 代谢/基因注释；归档把它列为后续规划，成功记录与结果未提供 |

这里的参数是归档内容，不等于确认它们生成了当前矩阵。可被环境变量覆盖的值是默认值；没有启动命令和日志，不能确定实际生效值。

### 两条容易混淆的证据

**Bowtie2 与 CoverM 的输入路径不同。** 分箱前 Bowtie2 示例回比的是 contigs；CoverM 旧记录则把 clean reads 直接交给 CoverM，并显式选 strobealign。当前 Sample × MAG 的成功运行是否也采用此配置，需要最终脚本确认，不能统一写成 Bowtie2 生成。

**DRAMMA 与 DRAM 在参考脚本中分别出现。** 第 13 步确实调用 `run_DRAMMA_pipeline.py`，用途为抗性基因预测；第 14 步是 DRAM 代谢注释。DRAMMA 的官方说明也支持这个用途，并说明输出包含预测分数。实际运行还需核对部署的代码版本及模型文件。[DRAMMA 官方仓库](https://github.com/burstein-lab/DRAMMA)、[DRAM 官方仓库](https://github.com/BortonWrightonLabs/DRAM)。

DRAMMA 的 HMM 阈值 `1e-5` 是参考命令中的特征搜索参数，不能直接当作最终抗性基因的预测分数阈值。它的输出也不能直接代替 MAG × KO 的代谢功能表。

### 旧终端记录为何不能直接作成功证据

- IQ-TREE 记录第 618 行有 **3.1.3 的运行横幅**，与用户清单一致；第 657 行却出现 `-s：未找到命令`。只能证明该历史调用碰到了这个版本的程序，不能证明树成功构建。
- CoverM 记录第 71 行的 **0.8.0 是脚本注释**；第 2422 行实际出现 `mkdir: missing operand`。版本可登记为用户报告，完整生成命令仍待最终成功脚本核对。
- 三份 MEGAHIT 附件、早期单工具分箱与后期三工具分箱并存；`run_three_binners_commented.sh` 与运行版的内容和部分默认路径配置不同，需分别确认实际使用版本。

本次未执行这些生信脚本。读取其中的删除、重建目录命令仅用于识别历史生成过程。

## 4. 软件版本怎样登记

用户原始清单已结构化保存为[软件与数据库报告](../reference/upstream-software-report-2026-10-01.json)，并在本地归档目录另存副本。全部版本均保留，没有择取某个 Python/NumPy 版本拼成环境。

| 主要组件 | 用户提供的版本 | 当前证据及缺口 |
| --- | --- | --- |
| Bowtie2 / SAMtools / HTSlib | 2.5.5 / 1.24 / 1.24 | 用户报告；缺回比成功脚本与逐环境记录 |
| MetaBAT2 | 2.12.1 | 用户报告；脚本默认 metabat2_env，实际环境版本待对应 |
| dRep / FastANI | 3.7.1 / 1.34 | 用户报告；历史 dRep 附件可读参数；v3 原 manifest 的 dRep 版本仍为空，需实际运行证据绑定 |
| GTDB-Tk / GTDB | 2.7.2 / R232 | 用户报告与 MAG v3 manifest 一致 |
| CheckM2 | 本次清单未列 | MAG v3 manifest 已登记 1.1.0，不必因清单缺项丢弃现有证据；数据库版本仍需提供 |
| IQ-TREE | 3.1.3 | 用户报告与旧运行横幅一致；成功产物与日志缺失 |
| CoverM / strobealign | 0.8.0 / 0.17.0 | 用户报告；旧 CoverM 命令选用 strobealign，尚未绑定成功运行 |
| antiSMASH | 8.0.4 | 用户报告；Pfam/MITE/ClusterBlast 等数据库版本已记录，具体运行数据库配置待核对 |
| Prodigal / HMMER / MMseqs2 | 2.6.3 / 3.4 / 18.8cc5c | 用户报告；与功能注释参考命令对应，实际环境待核对 |
| Python / NumPy / pandas / scikit-learn 等 | 多个版本并存 | 保留原清单；需按环境名、执行日期关联，不能据此认定环境冲突 |

GTDB-Tk R232、CheckM2 1.1.0 和 `k2_pluspf_20250714.tar.gz` 来自已交付 MAG v3 manifest。后者是该包登记的 reads 分类数据库证据，不能单独证明既有物种矩阵的全部生成过程。

还缺版本或精确来源的主要项目：MEGAHIT、SemiBin2、MetaDecoder、MAGScoT、Mash、DRAMMA 代码 commit/模型/特征数据库、TMHMM、DRAM 及实际注释数据库；物种/群落 KO 的分类与定量软件、数据库、标准化配置也未由本归档补齐。脚本注释提到 MetaDecoder 1.2.2 的兼容性，不代表当前服务器实际安装这个版本。

## 5. 接下来优先取回的资料

### A. 服务器实际脚本与运行记录

优先取回最终的 `run_coverm_mag_abundance.sh`、`run_gtdbtk_classify.sh`、`run_iqtree.sh`、`run_antismash_MAGs.sh`、实际 DRAMMA 启动脚本及对应成功日志；同时补 Bowtie2 回比、MAGScoT 和物种/群落 KO 的生成脚本。

每份记录至少关联：运行日期、环境名、脚本 SHA-256、实际启动命令、输入文件列表/校验值、输出文件列表/校验值和结束状态。历史失败日志保留用于解释，但不要替代成功日志。

### B. 环境与数据库

按实际环境分别提供 `conda list`、`conda list --explicit`、`conda env export`；源码安装的工具补 commit，模型和数据库补版本/下载日期/校验值。当前环境导出只能证明当前安装状态，过去运行时环境需要对应日期的日志或保存记录。

多个 Python 版本来自不同环境时很正常；登记重点是“哪一步用哪个环境、哪个解释器”。本机前端和后端继续使用已有运行环境，无需为了展示结果把全部生信工具装到 Windows。

### C. 可交付的数据产品

| 新模块 | 请生信组交付的最小数据 |
| --- | --- |
| 系统发育树 | 实际 Newick/treefile、MAG 叶节点映射、细菌/古菌范围、模型及支持度说明；树与 MAG ID 不匹配时提供映射表 |
| MAG 代谢功能 | `MAG ID → Gene ID → KO/EC/功能编号` 的明细、注释数据库和阈值、MAG × KO 汇总定义 |
| 抗性基因 | DRAMMA 可读 TSV/CSV，保留 MAG ID、Gene ID、预测类别/分数/阈值及证据；原始 pkl 可另存，前端接收可读表 |
| BGC | antiSMASH 的 MAG/contig/cluster 对应表、位置和类型、数据库匹配证据；原始结果另存 |

功能“存在/缺失或基因数”与样本中的功能“丰度”分别定义；不能拿 MAG 基因注释直接填充现有 Sample × KO。

## 6. 本次保存内容

- 官方样本来源记录继续保留在 CRA014435 快照，不修改其校验值。
- 脚本原件和历史记录保存在本地 storage 下；用户原目录完整保留。
- 软件清单单独登记为用户报告；MAG v3 原 manifest 保持原有证据，新增信息没有回写成未经验证的实际运行版本。
- 复现归档：[catalog-bioinformatics-archive.py](../../scripts/catalog-bioinformatics-archive.py)。快照目录拒绝覆盖。

```powershell
python scripts/catalog-bioinformatics-archive.py `
  --source 'G:/project/AD_shell_scripts_archive/AD_shell_scripts_archive' `
  --versions 'docs/reference/upstream-software-report-2026-10-01.json' `
  --output 'backend/storage/provenance/bioinformatics/NEW-SNAPSHOT'
```
