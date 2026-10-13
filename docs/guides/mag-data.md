# MAG 版本化丰度、分类、质量与来源接入

## 配置和数据边界

交付包不进入代码仓库；放在项目根目录的 `ADMetaData/` 可直接使用。
其他位置在被 Git 忽略的 `.env` 配置 `AD_META_MAG_DATA_ROOT`（数据包根目录，不是具体 `mag_vN`）。输入版本由 `AD_META_MAG_DATA_VERSION` 配置，必须使用 `mag_vN` 格式，默认 `mag_v2`。`mag_v3` 已作为完整候选目录接入代码契约，但必须在项目负责人验收后才显式切换。
`AD_META_MAG_STORAGE_BACKEND` 可设为 `package` 或 `database`。首次部署保持 `package`，完成数据库迁移和对应版本导入后可切为 `database`；切换存储后 API 契约和科学计算不变。
相对路径基于项目根目录而非启动 cwd。配置更改后重启后端。

运行时只读取 `development_input/mag_v2` 中八个输入：

- `abundance/sample_mag_relative_abundance.tsv`
- `abundance/sample_manifest.tsv`
- `abundance/mag_length.tsv`
- `abundance/sample_coverm_mapping_summary.tsv`
- `metadata/metadata_NC_AD.csv`
- `annotations/mag_taxonomy.tsv`
- `quality/mag_quality.tsv`
- `provenance/mag_v2_manifest.json`

`npm run prepare:mag:v2` 是显式的数据准备步骤：只读 `mag_v1`、GTDB-Tk 汇总和 CheckM2 报告，核验 872 个 MAG ID、基因组长度及数值范围后创建全新的 `mag_v2`；目标已存在时拒绝覆盖。业务 API 不读取 `source_data`，`mag_v1` 和源文件均不修改。
不将 R1/R2 原始路径和 Sample_name 等非必要元数据暴露到前端。

运行 `npm run validate:mag` 对当前所选存储后端进行只读校验（Windows 可在激活后端虚拟环境后，进入 `backend` 运行 `python -m app.cli.validate_mag`）。
`package` 模式只读校验数据包；`database` 模式从数据库重建完整数据集后校验 API 概览。成功退出 0，失败退出 1 并输出版本、预期/实际、影响、复现与处理建议。
API 异常返回 503 及同样的报告，不回退到旧 MAG 缓存、不影响原有物种/KO 服务。

将已核验版本导入数据库：

```bash
npm run migrate
npm run import:mag:database -- --version mag_v2
npm run import:mag:database -- --version mag_v3
```

导入器始终先从只读包加载并执行全部数据契约，再事务性写入数据库。只有各关系表计数全部一致时版本状态才变为 `ready`；同一 `mag_vN` 的不同指纹禁止覆盖，应建立新版本。数据库导入完成后可在 `.env` 设置 `AD_META_MAG_STORAGE_BACKEND=database` 并重启后端。

校验范围：精确表头、185×872 维度、CRR/MAG 唯一性和集合关联、`disease` AD 122 / NC 63、有限非负百分比、年龄/性别/批次、正整数长度；分类和质量表必须各有 872 个唯一 MAG，且与丰度矩阵完全同集。v3 还按 manifest 校验整个包的字节数与 SHA-256，并校验 8,548 个唯一成员、872 个聚类/代表、185 个来源样本、24 条实际 ANI＜0.95 记录和 crosswalk 的 266/577/29 状态计数。
质量输入还校验完整度 50–100%、污染率 0–10%、密度/GC 0–1、正整数长度/计数，以及 CheckM2 Genome_Size 与 mag_length 完全一致。
矩阵行和等于映射比例、mapped+unmapped 等于 100，绝对容差均为 **0.001 个百分点**，相对容差为零，仅用于文本舍入。
2026-08-31 实测最大行和偏差约 0.00011379018 个百分点。
百分比单位依据版本契约与映射汇总交叉核验；仅凭数值无法证明上游生物学语义，仍需数据维护方保证数据版本及单位。

## 使用

启动命令沿用 `npm run dev:backend` 和 `npm run dev:frontend`。
首页和原有工作区均有 MAG 入口，路径 `/analysis/mag`。

分析导航按数据就绪度分为四个区段：

- **丰度分析**：丰度与候选列表、单 MAG 分布、样本丰度热图，使用继承自 `mag_v1` 的已核验 CoverM 输入。
- **注释解析**：MAG 分类已接入，可按域至种切换 Top 20 分类；MAG 功能注释仍需 MAG×KO、CAZyme、ARG、BGC 稳定映射。
- **质量与来源**：MAG 质量展示全部 872 个代表 MAG 的完整度×污染率；v3 的“来源与去冗余”展示 dRep 成员—代表关系、来源样本和物种标识符对应。独立外部队列验证仍未完成。
- **技术质控**：映射与丰度阈值；只描述运行时技术指标，不替代 MAG 完整度、污染率或跨队列稳定性。

未满足数据契约的入口显示为“规划中”且不可操作，不读取 `source_data`，也不展示模拟图。

1. 通过 disease、性别、HPC_Batch、年龄区间筛选，点击“应用筛选”；不会在输入过程中反复重算。
2. 候选列表按均值、q 值、均值差、秩效应量或 MAG ID 排序；每页读取最多 300 条，默认展示 20 行，可拖动调整高度并展开至设定行数。图表独立选择 Top 10/20/30/50，不随列表翻页或排序变化。
3. 公共搜索支持完整或部分 MAG ID、GTDB 各分类层级的名称，不区分大小写；搜索完整结果后再分页，并同时应用于丰度图、列表和候选 CSV。点击 MAG ID 查看同范围 AD/NC 箱线图和全部样本散点，保留当前所选 MAG。
   单 MAG 页面分为两个独立折叠模块：上方“MAG 分布与证据”包含箱线图、散点及六项证据摘要，下方“样本丰度明细”包含当前 MAG 的样本列表。选择 MAG、候选浏览、图像导出和来源入口归属上方标题栏；候选换页、排序或搜索不会自动替换已选 MAG。样本表沿用轻量列头、默认 20 行及拖动调节高度。
4. 热图提供丰度概览、变化模式、候选对比（统计条件或手动清单）；先按 ID/分类、质量、均值、超过阈值样本比例筛选，再排序与截取。显示数量为 20/50/100/全部匹配项；图形每段 50 行，列表每页 300 行，二者独立。默认 disease / HPC_Batch / CRR ID 排序，可选择各组内部或全部样本聚类、MAG 行聚类（average linkage / Euclidean，基于当前颜色变换矩阵）。点击单元格或 MAG ID 定位单 MAG 分布，分布页可将该 MAG 加入手动热图候选。
5. MAG 分类按所选层级统计全部代表 MAG；Top 20 之外合并为“其他分类”。该视图不使用样本筛选，完整 872 行分类可下载。
6. MAG 质量图每个点代表一个 MAG；参考线为完整度 90%和污染率 5%，不等同于完整 MIMAG 高质量判定。完整 872 行质量可下载。
7. 技术质控中的映射与丰度阈值视图展示映射比例、未映射比例和超过指定丰度阈值的 MAG 数，不把阈值称为生物学检出，也不把映射比例当作 CheckM2 完整度。
8. 下载全部匹配候选（不是当前页）、当前样本×全部 MAG 的稠密矩阵（保留零值）、样本映射与阈值统计、分类、质量或分析溯源 JSON；v3 可下载未经改写的原始 lineage/crosswalk TSV。

图像导出复用 ChartFrame / EChartBase / chartExport：SVG 矢量或 PNG 2×，标准最小 1100×640、大图最小 1800×1000；尺寸不会缩小原图。
丰度图的选取控件位于图表标题栏，格式与尺寸在“导出图像”弹层中设置；列表排序、方向、列设置及完整数据下载位于列表标题栏。列表提供丰度、差异、质量、全部列预设及逐列勾选，按数据指纹记住显示偏好；MAG ID 固定在左侧，隐藏列不改变查询、统计或完整数据下载。
文件名带版本、视图、范围指纹和相应分页/排序/Top N/MAG 信息。原有导出净化逻辑继续排除 dataZoom、tooltip、toolbox 等交互控件。
表格的丰度展示最多 4 位有效数字，整数长度完整显示；CSV 保留后端数值精度。

## 科学口径

- 丰度保持 CoverM 原始百分比，**不将 872 个 MAG 闭合到 100%**。
- disease 是唯一疾病分组来源，绝不使用 `Group`。
- “超过丰度阈值”定义为丰度 **严格大于**阈值（默认 0%）；阈值仅改变超过阈值的比例/数量，不过滤或修改检验输入。上游未定义 presence/absence，因此不得将其称为生物学检出。
- 当前全部 161,320 个丰度值均大于零，因此默认超过阈值的比例为 100%。不据此推断覆盖度或真实生物学检出质量。
- 使用双侧 Mann–Whitney U 渐近检验、并列秩及连续性校正。所有 872 个 MAG（包括恒定特征）组成一次 BH-FDR 检验族，之后才搜索、排序、截取图表。
- 显示两组均值、中位数（API/CSV）、超过阈值的样本比例、AD−NC 均值差（百分点）、秩二列相关效应量、p 值和 q 值。秩效应量正值表示 AD 倾向更高，均值差与秩效应方向不保证一致。
- 任一组少于 2 个样本时，p/q 和秩效应量返回 null；单组仍可浏览，不伪造组间检验。
- 年龄/性别/批次筛选**不是协变量调整**，未控制混杂、组成性、重复探索、多次子集筛选的影响。q 值是当前筛选范围内的探索性结果。
- 热图默认颜色使用 `log10(1 + abundance_percent)`；工具栏提供带渐变预览的配色列表：PuBuGn（默认）、Blues、Viridis、Cividis、Magma、YlOrBr。其中 PuBuGn、Blues、YlOrBr 去除最浅的 15% 色段，避免白色端点。行标准化按每个 MAG 在全部所选样本中的 log 变换值计算 Z-score（总体标准差 ddof=0），提供以零为中心的 RdBu_r（默认）、BrBG、PuOr、PRGn 发散色阶；不能跨 MAG 比较丰度大小，恒定行以所选色阶的中性色表示。连续与发散模式分别记住配色，图像导出和配置 JSON 同步当前选择。tooltip/矩阵下载保留原始百分比，色标使用整个展示集合的范围、不随图形分段变化。箱线图须遵循 1.5×IQR，全体样本另以散点呈现。
- GTDB 分类覆盖 872/872 个 MAG；843 个有种级名称，29 个未解析至种。v2 未记录 GTDB-Tk/GTDB release，页面显示版本待补；v3 manifest 记录 GTDB-Tk 2.7.2 与 GTDB R232。
- v3 中 `disease` 是 AD/NC 疾病分组，`Group` 只是 CHN/CHN2 来源组。dRep 跨样本聚类不等于独立外部队列验证。
- 物种 crosswalk 是分类标识符对应，不是 read 到具体 MAG 的直接比对证据。未解析状态不得通过名称相似度升级为确定映射。
- CheckM2 1.1.0 质量覆盖 872/872 个 MAG；完整度范围 52–100%，污染率范围 0–9.92%。666 个落在完整度≥90%且污染率≤5%的参考区间，但缺少 rRNA/tRNA 等条件，不能仅据此称为 MIMAG 高质量 MAG。
- 输出仅为研究线索，不能称为临床诊断、已验证标志物或因果结论。

## API（新增，不替换旧接口）

所有接口前缀 `/api/mag`，GET：

| 路径 | 用途 |
| --- | --- |
| `/overview` | 校验结果、范围/分组计数、批次构成、筛选选项及溯源 |
| `/features` | 完整候选分页、搜索和排序 |
| `/features/{mag_id}` | 单 MAG 统计、箱线五数和样本数据 |
| `/heatmap` | 可筛选/排序/聚类的热图原始矩阵、显示矩阵、MAG 注释、选行审计及投影指纹 |
| `/samples` | 所选样本的映射比例、未映射比例和超过阈值的 MAG 数 |
| `/taxonomy` | 按域至种层级汇总全部代表 MAG 的 Top N 分类及未解析数量 |
| `/quality` | 全部代表 MAG 的 CheckM2 质量点和汇总范围 |
| `/lineage/clusters` | dRep 聚类概览，支持搜索、状态、低 ANI、排序和分页 |
| `/lineage/clusters/{cluster_id}` | 单个聚类的成员、来源、disease、Group、ANI、覆盖度和质量分页 |
| `/lineage/mags/{mag_id}` | 任意 lineage 成员 MAG 的来源—成员—聚类—代表—GTDB—NCBI/Bracken 证据链 |
| `/crosswalk` | 872 个代表 MAG 的物种标识符对应状态分页与筛选 |
| `/downloads/features` | 全部搜索匹配候选 CSV，不应用 limit/offset |
| `/downloads/matrix` | 当前筛选样本×全部 872 MAG，忽略候选搜索/分页 |
| `/downloads/samples` | 当前筛选样本的映射与阈值统计 CSV |
| `/downloads/taxonomy` | 完整 872 行 MAG 分类 CSV |
| `/downloads/quality` | 完整 872 行 MAG 质量 CSV |
| `/downloads/lineage` | v3 原始 8,548 行 lineage TSV |
| `/downloads/crosswalk` | v3 原始 872 行 species taxonomy crosswalk TSV |
| `/downloads/provenance` | JSON：方法、输入文件哈希、样本 ID、筛选和展示选择 |

共同参数：`disease`（空/AD/NC）、`gender`（空/F/M）、`batch`（空/1–5）、`ageMin`、`ageMax`、`abundanceThresholdPercent`（0–100）、`revision`（可选预期数据指纹）。
列表支持 `query`（MAG ID 或 GTDB 分类名称）、`sortBy`、`direction`（asc/desc）、`limit`（1–300）和 `offset`；热图 `topN`（0–1000，0 表示全部匹配项），以及 `heatmapMode`、`heatmapQuery`、`heatmapIds`、`candidateKind`、`minMean`、`sampleThreshold`、`minSamplePercent`、`minCompleteness`、`maxContamination`、`maxQ`、`minEffect`、`sampleOrder`、`rowOrder`、`colorMode`。热图独立 `sampleThreshold` 不继承全局技术阈值；仅筛选展示，不改变原始丰度和 BH 检验族。分类支持 `rank`（domain 至 species）和 `topN`（5–50）。分类与质量数据本身不受样本筛选影响。

`/downloads/heatmap` 下载展示集合的原始百分比矩阵，MAG 和样本顺序与热图完全一致；`/downloads/provenance?view=heatmap` 记录热图条件、实际 MAG/样本顺序、变换及聚类方法。页面“下载配置与溯源”额外记录样式、图形分段和导出设置。图像导出包含整个展示集合（包括当前分段之外的 MAG）、图例与注释条，排除 HTML 图形样式工具栏。已应用设置在本次会话内保留；“保存配置”按数据指纹持久保存，不保存尚未应用的输入。
溯源下载还记录 `view`、`magId`、`topN`、`limit`、`offset` 和实际展示的 MAG ID，提供独立 `projectionFingerprint`。
OpenAPI 为字段、枚举和响应类型的精确依据。

## 兼容和复现

MAG 同时支持版本化文件适配器和版本化关系数据库，二者重建同一 `MagDataset`，复用共享 BH 函数、图表框架、展示披露和分页组件。MAG 使用独立 `mag_*` 表，不将 lineage/crosswalk 混入 Species/KO revision 表，也不将未知分类的 MAG 强行写入确定映射。
MAG 数据库保存源文件 SHA-256、manifest、样本与代表 MAG 顺序、完整稠密丰度、分类、质量、聚类成员和 crosswalk。原数据包仍是导入证据和原始 TSV 下载来源，不因数据库导入而删除。与既有持久化 ProjectionAudit 不同，当前 MAG 溯源仍由数据版本指纹、分析版本、范围参数与展示选择重建，不写入既有 projection audit 表。`mag_v2` 继承已确认的 CoverM 0.8.0、strobealign、minimum covered fraction 0 和 dense 输出参数，并记录 CheckM2 1.1.0；这些参数按版本固化，不从 `source_data` 运行时读取。

`source_data/data/abundance/metric_definitions.tsv` 当前缺少 TSV 分隔符，不能作为结构化字段定义直接解析。它不影响上述稳定输入；如后续接入覆盖度等辅助指标，应由数据维护方生成新版本的规范字段与溯源清单，不修改现有版本。

文件模式以路径、尺寸、纳秒 mtime/ctime、inode 标识快照，最多缓存 2 个数据快照；数据库模式按版本 ID 和数据指纹缓存最多 4 个重建快照。统计范围缓存策略保持不变。
内容指纹覆盖版本要求的全部文件；文件导入前缺失或变化会失败。数据库版本只允许从已通过该校验的快照创建，并保存同一数据指纹。
前端先取得 overview 指纹，再把该 `revision` 传给图表和下载；指纹变化返回 409，要求刷新。
CSV 每行带数据指纹、范围指纹、scopeJson 和单位，范围指纹与 JSON 可关联。

代码仓库未复制数据包内容，也未新增包依赖或改变既有 `COMPUTE_VERSION`。
原有物种/KO 工作区的“完整结果查询与下载”调用交接已有的 artifact-scoped 接口；独立查询、不继承图表筛选，不为稀疏存储缺失组合补零。

部署时应把外部数据包保留在代码仓库之外，通过 `.env` 显式设置
`AD_META_MAG_DATA_ROOT` 为主机上的只读目录、`AD_META_MAG_DATA_VERSION` 为已核验版本，并在完成导入后设置 `AD_META_MAG_STORAGE_BACKEND=database`。
没有数据时 MAG 返回清晰 503，不阻塞原有服务。
