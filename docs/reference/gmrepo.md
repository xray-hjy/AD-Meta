# GMrepo 参考数据接入

当前完整迭代见[交付与验收记录](../development/2026-10-17-gmrepo-complete-evidence-implementation.md)。登记 18 项、126 份依据全部校验一致；补查 16 个相关项目样本表。全库分页实际读取 188,061 条 Run×表型记录，去重 184,045 Run 与源端一致；项目描述及编号联合 1,243 / 1,349 项，仍缺 106 项，不宣称全库覆盖。固定包仍为 13 项、1,269 Run、800 完整 profile、322 属，5 个分布队列、2 个可检验队列；主队列新增完整 966 属派生及主外对照，不变更 185 样本。

GMrepo 是独立外部参考模块，提供样本、队列、菌属和质量记录。经校验的处理包由后端只读加载，不并入主分析数据集，不改写原快照或已有物种/KO/MAG 表。

2026-10-14 起前端升级为“外部证据评估”：保留全部参考可视化，增加无侧栏对象详情、接入登记和主物种/MAG 对象贯通。[首版实施记录](../development/2026-10-14-gmrepo-evaluation-implementation.md)包含真实来源清点、接口、案例与待补事项。

2026-10-15 增加[研究台账与统一资格](../development/2026-10-15-gmrepo-research-ledger-implementation.md)：`resources` / `evidence-summary` 返回 `researchLedger` 及逐项目 `researchRecord`，审计对象增量返回 `capabilities`、结构化 `blockers` 与登记/比较集合指纹。默认 13 项已接入，另 1 项仅发现；来源清点 partial 与科研复核 pending 分开。补充登记位于 `backend/metadata/gmrepo_research_registry.json`，不授予新的检验资格；有效撤销/暂缓会使依赖缓存失效。检查命令为 `node scripts/backend-python.mjs -m app.cli.validate_gmrepo_ledger`，不执行下载或人工审查。

同日[迭代二](../development/2026-10-15-gmrepo-iteration-two-implementation.md)补入三项来源样板、14 项初筛去向和 schema 2 的原件/字段/有效复核更正链。`evidence-summary` 返回 `claims`、`evaluationId` 和 `snapshotStatus`；`GET /api/references/gmrepo/evaluation-package?evaluationId=...` 导出固定包，`report` 可携带相同 ID，缺包/校验失败不回退当前重算。旧无 ID 报告保留兼容行为。该阶段保证固定读回；当前版本已另有包含主种→属派生和主外完整统计的独立复算 ZIP，仍不重跑 FASTQ 或代替科研批准。

## 页面和接口

- 页面 `/reference/gmrepo`：首页及分析工作区顶栏有入口。
- 页面 `/reference/gmrepo/comparison`：完整主外候选目录、主物种集合归属、效应矩阵、固定多候选评估及报告/JSON/主外独立复算包；未对应与歧义不代入其他属。
- `GET comparison-catalog`、`POST candidate-comparison`、`GET candidate-report`（均位于 `/api/references/gmrepo/`）提供完整检验后查询、明确集合冻结及固定报告；搜索不改变 FDR。
- 页面 `/reference/gmrepo/evidence`：接收固定主物种/MAG 对象和版本；无对象时要求明确选择。`/reference/gmrepo/evidence/:genusId` 可直接查看参考属，旧 `view=genus` 链接兼容跳转。
- `GET /api/references/gmrepo/resources`：接入协议、研究登记、官方发现清单、来源文件可用性；检索未完成部分明确标为 partial。
- `GET /api/references/gmrepo/resolve-subject`：`subjectType`、`subjectId`、`sourceRevision` 和可选 `datasetSlug/runKey/artifactKey`；解析固定对象，失败不默认代入菌属。
- `GET /api/references/gmrepo/evidence-summary`：`genus`、参考 `revision` 和可选主物种 `sourceRevision/datasetSlug`；跨队列逐行汇总，不合并统计或重复计票。
- `GET /api/references/gmrepo/report`：上述版本与对象、来源范围生成 Markdown 报告；主对象必须与报告属可靠对应。
- `GET /api/references/gmrepo/catalog`：版本、来源、队列及筛选目录。
- `GET /api/references/gmrepo/overview`：队列数量、互不重叠的纳入状态、年龄/性别可用性、分类待解析比例。
- `GET /api/references/gmrepo/genera?query=Raoultella`：当前细菌/古菌属目录，可按当前名、来源旧名及 TaxID 搜索。
- `GET /api/references/gmrepo/samples`：分页元数据、分组依据、身份标记及可选菌属丰度列。
- `GET /api/references/gmrepo/audit`：5 个可画图队列的参与者、重复编号、协变量及推断资格核查。
- `GET /api/references/gmrepo/distribution?cohort=PRJEB51982&genus=NCBI:816`：单队列 AD/NC 箱线图、全部 Run 散点与质量信息。
- `GET /api/references/gmrepo/statistics?cohort=PRJEB51982`：完整目标菌属目录的队列内探索性检验，支持 `query`、`limit`、`offset`。
- `GET /api/references/gmrepo/evidence?cohort=PRJEB51982&genus=NCBI:816`：所选属的效应/区间、来源 LDA 与当前主物种矩阵分类覆盖。

概览与样本接口支持 `cohort`、`group`、`scope`；样本接口另支持 `genus=NCBI:570`、`limit`（1–100）、`offset`。`scope` 有 `all`、`complete`、`plot_ready`、`group_confirmed`、`stage_reference`、`pending`、`no_profile`。

`group` 使用处理后的研究分组，原 GMrepo 标签另列保留。选择菌属只选择测量列，不按非零值删样本。所有接口可传 `revision`（目录返回的 fingerprint）；版本不符返回 409，避免混用版本。

“菌属分布与证据对照”使用独立的 `analysisCohort` / `analysisGenus` 页面参数，始终比较同一队列全部 `plot_ready` AD/NC。概览的 `group` 或 `scope` 不改变其分母。可切换原百分比与 `log10(百分比+1)` 展示；变换不改样本、原丰度或检验结果。箱体采用线性插值四分位数，须端为 1.5 IQR 范围内实际值；离群点不重复绘制，全部真实样本只在散点层出现一次。工具提示与可展开表格保留参与者/样本编号、年龄、原性别代码、读取数、QC 和待解析比例。

## 数据包和启动

默认目录为 `ADMetaData/reference/gmrepo/processed/2026-10-09-v1`。可用 `AD_META_GMREPO_DATA_ROOT` 指定其他经过校验的处理目录；相对路径以仓库根解析，绝对路径也支持。

仓库现随源码提供 [固定版本运行 ZIP 和交付清单](../../data-packages/README.md)，无需另外索取当前页面的数据。基础读取文件须与 `processing_manifest.json` 中的哈希相符：

```text
data_contract.json
quality_checks.json
validation_readback.json
cohort_rules.json
tables/sample_metadata_clean.json
tables/taxonomy_mapping.json
tables/genus_abundance_long.tsv
```

首次读取检查 SHA-256、元数据键、目标分类层级/域、丰度键、总比例守恒及可用样本数，然后按处理清单 fingerprint 缓存只读结果。发布新版本时使用新的完整目录和清单；不要在原版本随意改文件。缺少或校验失败的数据返回 503，页面不替换成示例数据。

当前交付包共 14 个文件，除上述 7 文件和原 `processing_manifest.json`，还包括：

```text
tables/source_marker_evidence.tsv
raw/ena/PRJEB51982_samples_0000.xml
raw/papers/PMC5648830.xml
evidence/PRJEB59009_author_metadata.tsv
extract_author_metadata.R
raw/papers/PMC10776369.xml
```

它们分别支持来源 LDA 对照与当前两个合格队列的身份审查。原数据字节和 fingerprint 保持不变；原清单仍包含完整科研处理目录的 119 项，运行包不包含重处理所需的原快照和全部派生产物。

### Windows 下载者的恢复步骤

先将项目更新到包含 `data-packages/` 与安装器的当前 `main`（Git 下载可执行 `git pull --ff-only`；Download ZIP 用户重新下载并解压当前源码）。在 `G:\project\admeta` 的 PowerShell 中运行：

```powershell
.\Start-ADMeta.ps1 gmrepo
npm run verify:gmrepo
# 在两个终端分别运行：
.\Start-ADMeta.ps1 backend
.\Start-ADMeta.ps1 frontend
```

默认安装结果是 `G:\project\admeta\ADMetaData\reference\gmrepo\processed\2026-10-09-v1`。直接运行后端命令也会自动安装默认包；单独执行 `gmrepo` 可以在启动服务前确认交付完整。安装过程中不需要额外下载数据或连接 MySQL；后端主分析功能的 MySQL 配置仍按 [运行手册](../guides/runbook.md) 完成。

macOS / Linux 对应命令为 `npm run setup:gmrepo`、`npm run verify:gmrepo`、`npm run dev:backend` 与 `npm run dev`。后端和前端分别监听 8000 / 3000；仅启动 `backend` 不会启动前端。

已有 Python 时，也可直接使用标准库安装器：

```powershell
python backend/app/cli/install_gmrepo.py --destination "ADMetaData/reference/gmrepo/processed/2026-10-09-v1"
python backend/app/cli/install_gmrepo.py --destination "ADMetaData/reference/gmrepo/processed/2026-10-09-v1" --check
```

需要手动解压时，把 `data-packages/gmrepo-2026-10-09-v1.zip` 的内容直接解压到该版本目录，确保 `processing_manifest.json` 直接在版本目录内，不要多嵌套一层文件夹，再运行 `npm run verify:gmrepo`。校验器同时检查 ZIP、所有 14 文件及原处理清单的 SHA-256。

### 已有目录与自定义部署

安装器先在同一父目录建立临时目录，解压并逐文件验证后才交付最终目录；失败会清理暂存文件。已有目录验证通过时不写入数据；不完整、损坏或属于其他版本时拒绝覆盖，保留原文件。先备份该目录，再选择一个尚不存在的目录安装，或从可信归档恢复已验证版本。

后端自动安装只作用于默认数据目录。配置 `AD_META_GMREPO_DATA_ROOT` 为自定义路径时，启动过程保留该配置；部署者应提供该路径的数据，或显式运行 `npm run setup:gmrepo -- --destination <自定义目录>` 安装当前固定版本。相对路径以仓库根目录解析。

安装后的数据目录、原科研快照和运行缓存仍被 Git 忽略；仓库中只有经核验的运行 ZIP、交付清单和来源说明。这个运行包足以使用现有 GMrepo 功能，不能代替完整原快照来重跑科研处理管道。

## 科学口径

- Run 是测序记录；BioSample 共用不等于同一个独立生物样本，实验/样本别名和身份状态保留。
- AD/NC 图只统计 `plot_ready`，不包含 MCI、风险组、临床前或待核查组。
- 每个 Run 只进入六种纳入状态之一，总和等于当前元数据数。阶段参考中的无属级信息记录不重复计入“AD/NC 已核对，属级信息不足”。
- 元数据质量图以完整 profile 为分母。年龄 `90+` 不猜精确值；性别未知含原码未解码。空分母对应空百分比，不显示为 0%。
- 分类质量图按队列显示待解析比例中位数，轴固定 0–100%。已解析属保持原百分比，不重新归一化。
- 没有 profile 或完全没有目标属时，可选菌属测量返回 `null`；有目标属信息的完整稀疏 profile 未列出所选属才返回 0。小的正丰度不会在列表中被四舍五入成 0。
- 本版不重算来源 LDA，不提供临床预测或跨平台数据合并。

## 推断前核查与方法

身份审查登记在 `backend/metadata/gmrepo_inference_review.json`，绑定处理包 fingerprint、全部队列 Run 集合的 SHA-256 及证据文件哈希。版本改变、证据损坏、编号缺失或重复均使推断关闭，分布仍可查看。编号在同一研究内有效，不跨队列去重；目前没有已核实的配对设计，使用独立两组方法。

当前仅 PRJEB51982 和 PRJEB59009 通过独立参与者核查：前者 50 个唯一编号，精确年龄/性别完整 48 人；后者参考包全部 145 个编号唯一，图表 AD/NC 64 人均有精确年龄与原性别类别。作者原表 151 条粪便记录中的 `patient_id.x` 也各出现一次。PRJEB59009 的 `Geschlecht` 原码 1/2 作为类别因子，尚未声明男女映射。`90+` 不猜测精确年龄。PRJNA554111、PRJNA633959、PRJNA770746 保留身份核查缺口，暂缓差异检验；共用 BioSample 不自动合并或自动认证独立性。

- 未调整：原相对百分比的双侧 Mann–Whitney U，渐近法、并列秩/连续性校正；任一组至少 10 人。它检验分布差异，不能无条件称为中位数差异。报告 AD 方向的秩二列相关；所选属另给固定种子、独立组内 2,000 次 bootstrap 的 95% 百分位区间。
- 调整：只用完整年龄/性别记录，响应为该子集中的平均并列秩换算至 0–100 百分位位置；`响应 ~ 截距 + AD指示 + 中心化年龄/10 + 性别类别`。用 statsmodels OLS / HC3、残差自由度的 t 推断与 95% CI，检查设计矩阵秩、条件数、杠杆值和自由度。效应单位为百分位秩点差，不是原丰度百分点。常量属无效应区间；不能估计的模型不编造 p/q。
- 多重性：每个队列、每种模型固定对完整 322 个目标属做 BH 校正，包括常量和未检出属；检索、分页和所选菌属不能重算缩小后的 q。无法估计的模型以 1 进入校正但不显示虚构的 p/q。“调整前后同向且均通过 FDR”要求两者 q<0.05 且效应同号，只是探索性标记。
- 主矩阵对照：读取指定发布 revision（未指定时为当前版本），按域一致的精确属名及已核对旧名查物种覆盖，保留源 SHA-256 和 revision。内部 `taxon_id` 不是 NCBI TaxID，名称匹配不等于完整跨平台注释统一。当前 MetaPhlAn 4 源表为百分数，导入除以 100 保存为比例，不二次闭合；接口按版本读取真实单位，历史版本仍保留自己的语义。185 个样本的分组及年龄/性别已有补充材料依据；原研究人数支持一人一份样本的解释，但公开受试者 ID 缺失，逐人重复采样和主外重叠未经确认。当前已派生完整 966 属及主队列效应、调整模型和区间，主外在各自完整检验族内校正并列展示；歧义不合并、未知分类不丢弃。该探索性结果仍不是独立复现认证，不能从物种列存在、来源 marker 或单队列显著结果推定。

相对丰度的组成约束、未测药物/饮食/BMI、年龄非线性及属级信息不足样本的排除可能影响结果；HC3 不解决这些问题。没有原始计数，不能把本次分析称为 DESeq2、ANCOM-BC 或已复现作者的原统计模型。

方法参考：[SciPy Mann–Whitney U](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html)、[statsmodels HC3](https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.OLSResults.get_robustcov_results.html)、[组成数据的参考框架](https://www.nature.com/articles/s41467-019-10656-5)。身份与来源：[PRJEB51982 原研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC5648830/)、[PRJEB59009 原研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC10776369/)、[作者公开数据](https://github.com/trocialba/Alzheimer-Project)。

## 本地分析结果导出

原快照及处理包保持不变，衍生结果另存新目录。页面可下载所选菌属的图表、审查与证据 JSON；完整目录可用以下命令导出（输出目录已存在时拒绝覆盖）：

```bash
cd backend
.venv/bin/python -m app.cli.export_gmrepo_analysis --output ../ADMetaData/reference/gmrepo/analyses/2026-10-12-v1
```

输出包含 5 队列 audit、完整菌属统计 JSON、两个合格队列的 322 行 TSV、示例 Bacteroides 分布/证据、方法/软件版本、哈希清单及结果说明。主数据库不可用时保留参考队列结果，明确标记主数据证据不可读取。

## 验证

2026-10-16 增量见 [v1.3 实施记录](../development/2026-10-16-gmrepo-release-implementation.md)：保留现有 GMrepo 包和资格，另有作者直接来源 PRJNA798058 的 WGS 临床前阶段参考（164 人，49/115；不是 GMrepo WGS 或临床 AD/NC），21 对关系范围和参考统计离线复算包。产品仍是一套页面，不设置内外版本或人员待审工作台；来源、分布、结果、比较范围与适用限制均在同一研究流程中查看。新增本地 WGS 包并未随原 GMrepo 运行 ZIP 分发，部署及再分发限制见实施记录。

`backend/tests/test_gmrepo*.py` 用独立的小型数据包验证哈希、分区、缺失分母、共用 BioSample、零/空值、旧名搜索和版本约束；另验证年龄混杂导致方向反转、HC3 的矩阵计算、重复/缺失编号关闭推断、原性别类别、完整协变量子集、奇异模型、完整目录 FDR 不随检索变化，以及主数据分类匹配的域/revision 边界。前端测试验证固定 AD/NC 分母、暂缓状态不展示推断数值、分页重置、质量信息和两种图表尺度。OpenAPI 和前端类型随接口更新。

`backend/tests/test_install_gmrepo.py` 从仓库交付 ZIP 安装到空目录，读回实际目录、身份审查和两个合格队列的完整 322 属统计；另测试重复安装、数据损坏、缺少证据、ZIP 损坏 / 路径越界 / 符号链接及自定义目录保护。Windows CI 用标准库 Python 实际安装、读回并重复安装同一包。完整原科研快照不作为 CI 前置条件；本机原包的密封文件另做 SHA-256 保持性核对。
