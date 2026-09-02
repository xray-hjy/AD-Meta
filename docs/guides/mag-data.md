# MAG v2 丰度、分类与质量接入

## 配置和数据边界

交付包不进入代码仓库；放在项目根目录的 `ADMetaData/` 可直接使用。
其他位置在被 Git 忽略的 `.env` 配置 `AD_META_MAG_DATA_ROOT`（数据包根目录，不是具体 `mag_vN`）。输入版本由 `AD_META_MAG_DATA_VERSION` 配置，必须使用 `mag_vN` 格式，默认 `mag_v2`。
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

运行 `npm run validate:mag` 进行只读校验（Windows 可在激活后端虚拟环境后，进入 `backend` 运行 `python -m app.cli.validate_mag`）。
CLI 不连接数据库、不写缓存；成功退出 0，失败退出 1 并输出文件、预期/实际、影响、复现与处理建议。
API 异常返回 503 及同样的报告，不回退到旧 MAG 缓存、不影响原有物种/KO 服务。

校验范围：精确表头、185×872 维度、CRR/MAG 唯一性和集合关联、`disease` AD 122 / NC 63、有限非负百分比、年龄/性别/批次、正整数长度；分类和质量表必须各有 872 个唯一 MAG，且与丰度矩阵完全同集。
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
- **质量与复现**：MAG 质量已接入，展示全部 872 个代表 MAG 的完整度×污染率；跨队列复现仍需独立研究队列和一致分析口径。
- **技术质控**：映射与丰度阈值；只描述运行时技术指标，不替代 MAG 完整度、污染率或跨队列稳定性。

未满足数据契约的入口显示为“规划中”且不可操作，不读取 `source_data`，也不展示模拟图。

1. 通过 disease、性别、HPC_Batch、年龄区间筛选，点击“应用筛选”；不会在输入过程中反复重算。
2. 候选列表按均值、q 值、均值差、秩效应量或 MAG ID 排序；每页 25 条，图示当前页前 15 条。
3. 点击 MAG ID 查看同范围 AD/NC 箱线图和全部样本散点。也可按 ID 搜索或用分页选择器浏览。
4. 热图按范围内平均丰度选择 Top 10/20/30/50；保留所有所选样本，按 disease / HPC_Batch / CRR ID 排序。不做聚类。
5. MAG 分类按所选层级统计全部代表 MAG；Top 20 之外合并为“其他分类”。该视图不使用样本筛选，完整 872 行分类可下载。
6. MAG 质量图每个点代表一个 MAG；参考线为完整度 90%和污染率 5%，不等同于完整 MIMAG 高质量判定。完整 872 行质量可下载。
7. 技术质控中的映射与丰度阈值视图展示映射比例、未映射比例和超过指定丰度阈值的 MAG 数，不把阈值称为生物学检出，也不把映射比例当作 CheckM2 完整度。
8. 下载全部匹配候选（不是当前页）、当前样本×全部 MAG 的稠密矩阵（保留零值）、样本映射与阈值统计、分类、质量或分析溯源 JSON。

图像导出复用 ChartFrame / EChartBase / chartExport：SVG 矢量或 PNG 2×，标准最小 1100×640、大图最小 1800×1000；尺寸不会缩小原图。
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
- 热图颜色使用 `log10(1 + abundance_percent)`，tooltip/下载保留原始百分比；箱线图须遵循 1.5×IQR，全体样本另以散点呈现。
- 当前 GTDB 分类覆盖 872/872 个 MAG；843 个有种级名称，29 个未解析至种。GTDB-Tk 版本及 GTDB reference release 未随源文件交付，页面和溯源必须明确“版本待补”。
- CheckM2 1.1.0 质量覆盖 872/872 个 MAG；完整度范围 52–100%，污染率范围 0–9.92%。666 个落在完整度≥90%且污染率≤5%的参考区间，但缺少 rRNA/tRNA 等条件，不能仅据此称为 MIMAG 高质量 MAG。
- 输出仅为研究线索，不能称为临床诊断、已验证标志物或因果结论。

## API（新增，不替换旧接口）

所有接口前缀 `/api/mag`，GET：

| 路径 | 用途 |
| --- | --- |
| `/overview` | 校验结果、范围/分组计数、批次构成、筛选选项及溯源 |
| `/features` | 完整候选分页、搜索和排序 |
| `/features/{mag_id}` | 单 MAG 统计、箱线五数和样本数据 |
| `/heatmap` | 按均值排名的所选样本×Top N 原始百分比 |
| `/samples` | 所选样本的映射比例、未映射比例和超过阈值的 MAG 数 |
| `/taxonomy` | 按域至种层级汇总全部代表 MAG 的 Top N 分类及未解析数量 |
| `/quality` | 全部代表 MAG 的 CheckM2 质量点和汇总范围 |
| `/downloads/features` | 全部搜索匹配候选 CSV，不应用 limit/offset |
| `/downloads/matrix` | 当前筛选样本×全部 872 MAG，忽略候选搜索/分页 |
| `/downloads/samples` | 当前筛选样本的映射与阈值统计 CSV |
| `/downloads/taxonomy` | 完整 872 行 MAG 分类 CSV |
| `/downloads/quality` | 完整 872 行 MAG 质量 CSV |
| `/downloads/provenance` | JSON：方法、输入文件哈希、样本 ID、筛选和展示选择 |

共同参数：`disease`（空/AD/NC）、`gender`（空/F/M）、`batch`（空/1–5）、`ageMin`、`ageMax`、`abundanceThresholdPercent`（0–100）、`revision`（可选预期数据指纹）。
列表支持 `query`、`sortBy`、`direction`（asc/desc）、`limit`（1–100）和 `offset`；热图 `topN`（1–50）；分类支持 `rank`（domain 至 species）和 `topN`（5–50）。分类与质量数据本身不受样本筛选影响。
溯源下载还记录 `view`、`magId`、`topN`、`limit`、`offset` 和实际展示的 MAG ID，提供独立 `projectionFingerprint`。
OpenAPI 为字段、枚举和响应类型的精确依据。

## 兼容和复现

MAG 采用版本化文件的只读适配器，复用共享 BH 函数、图表框架、展示披露和分页组件，不将未知分类的 MAG 强行写入 taxonomy/KO revision 表。
与既有持久化 ProjectionAudit 不同，MAG 溯源由文件内容 SHA-256、分析版本、范围参数与展示选择重建；可下载 JSON，但**不创建既有数据库审计记录**。`mag_v2` 继承已确认的 CoverM 0.8.0、strobealign、minimum covered fraction 0 和 dense 输出参数，并记录 CheckM2 1.1.0；这些参数按版本固化，不从 `source_data` 运行时读取。

`source_data/data/abundance/metric_definitions.tsv` 当前缺少 TSV 分隔符，不能作为结构化字段定义直接解析。它不影响上述稳定输入；如后续接入覆盖度等辅助指标，应由数据维护方生成新版本的规范字段与溯源清单，不修改现有版本。

文件缓存以路径、尺寸、纳秒 mtime/ctime、inode 标识快照，最多缓存 2 个数据快照和 16 个统计范围。
内容指纹覆盖八个文件；文件缺失/变化会重新校验，不继续服务已失效快照。
前端先取得 overview 指纹，再把该 `revision` 传给图表和下载；指纹变化返回 409，要求刷新。
CSV 每行带数据指纹、范围指纹、scopeJson 和单位，范围指纹与 JSON 可关联。

代码仓库未复制数据包内容，也未新增包依赖或改变既有 `COMPUTE_VERSION`。
原有物种/KO 工作区的“完整结果查询与下载”调用交接已有的 artifact-scoped 接口；独立查询、不继承图表筛选，不为稀疏存储缺失组合补零。

容器部署时应自行以只读卷挂载外部数据包，并显式设置 `AD_META_MAG_DATA_ROOT` 为容器内挂载目录、`AD_META_MAG_DATA_VERSION` 为已核验版本。
当前 Compose 默认不挂载该数据包；没有数据时 MAG 返回清晰 503，不阻塞原有服务。此轮不包含容器部署验证。
