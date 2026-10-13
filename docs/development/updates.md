# AD-Meta 最新更新日志

## 20261013更新

- 将开发分支的 MAG / 物种 / KO 改进、新版首页和 CI 修复合入 `main`；完成 Dependabot PR #13 的 13 项 Python 依赖升级。
- 发布独立 GMrepo 外部参考模块，支持队列质量、参考样本核查、菌属箱线图 / 散点、身份审查、探索性检验与证据对照。
- 参考数据按版本和 SHA-256 只读加载；缺少参与者或协变量证据时保留分布并暂缓推断，完整 322 属的 BH-FDR 检验族不随页面筛选缩小。
- 保留新版首页和分析顶栏的 GMrepo 入口，修复窄屏导航换行，补充外部数据包部署配置、OpenAPI / 前端类型及 MAG 独立建表 SQL。
- 完整变更、科学边界、部署条件和验证记录见 [20261013更新](20261013-update.md)。

## 20261011 CI 修复

- 更新前端依赖锁文件与 Vitest / coverage-v8，保持高危审计和覆盖率门槛。
- 修正 MySQL 集成测试对实际投影响应的断言，完善浏览器可访问性与标题定位。
- 为完整 MAG 集合及工作区首次懒加载保留条件等待并适当延长超时。
- 完整记录见 [20261011 CI 修复](20261011-ci-fixes.md)。

## 20261010更新

- 正式首页接入首屏、可视化图集和数据来源三个大区块，链接现有分析工作区。
- 增加立体画廊、滚轮吸附和连续切图、模块正文及区块过渡。
- 真实 SVG 部件播放五种随机 Logo 动画，避免连续重复。
- 整理首页局部样式，新增前端目录导航和维护说明。
- 完整记录见 [20261010更新](20261010-update.md)。

## 20261008更新

- MAG 工作区、研究面板、层次聚类热图、真实聚类树与导出布局优化。
- 物种 / KO 条形图共享适配、科研样式、主题下拉菜单和自定义 Top N 面板。
- 自动补全、表格高度拖动与边缘滚动、数据说明及来源接口更新。
- 完整更新与对比清单见 [20261008更新](20261008-update.md)。

> 最新开发说明见 [MAG 丰度、分类与质量接入](../guides/mag-data.md)；上阶段交接见 [2026-08-20 第二阶段开发收尾日志](2026-08-20-stage-two-closeout.md)。

## 2026-09-13：MAG 版本化关系数据库

- 新增 Alembic `20260912_01` 迁移，以 10 张独立关系表持久化 MAG 数据版本、包文件哈希、样本、代表 MAG、丰度、GTDB 分类、CheckM2 质量、dRep 聚类/成员和 taxonomy crosswalk。
- 数据库以 `mag_vN` 和源数据指纹作为不可变身份；同版本同指纹重复导入保持幂等，同版本不同指纹拒绝覆盖，避免历史科学证据被静默改写。
- 新增 `npm run import:mag:database -- --version mag_vN`：先按原数据包契约校验，再在单个事务中写入并核对各表行数，全部通过后才把版本标记为 `ready`。
- MAG API 可通过 `AD_META_MAG_STORAGE_BACKEND=database` 从数据库重建与文件模式相同的 `MagDataset`；溯源新增 `storageBackend`，原始 lineage/crosswalk 下载仍指向受 manifest 校验的数据包文件。
- 本机 MySQL 已导入 `mag_v2` 与 `mag_v3`；运行后端切换为 database 存储，但展示版本仍保持 `mag_v2`，未提前启用 v3。

## 2026-09-09：MAG v3 候选数据前后端接入

- 将完整、自包含的 `mag_v3` 目录复制到版本化 MAG 数据根目录；运行时仍默认使用 `mag_v2`，待项目负责人验收后再显式切换。
- v3 加载器按 `mag_v3_manifest.json` 校验包内 12 个文件的字节数与 SHA-256，并强校验 185×872 丰度、8,548 个唯一成员、872 个聚类/代表、185 个来源样本和 24 条实际 ANI＜0.95 记录。
- 新增 dRep 聚类概览、分页成员详情、任意成员 MAG 证据链与物种 crosswalk 只读 API；列表均有服务端分页、筛选和请求上限，lineage/crosswalk 下载返回未经改写的原始 TSV。
- MAG 工作区用“来源与去冗余”替换原“跨队列复现”入口，明确区分 disease 与 Group，并保留独立外部队列验证为未完成能力；未加入 MAG×KO。
- crosswalk 页面明确区分精确 TaxID 对应、本批 Reads 未观察到和未解析，不用名称相似度升级状态，也不宣称 reads 已直接比对到具体 MAG。
- MAG 图表改用与 Species/KO 一致的 AD/NC 色板，继续复用共享 TopBar、工具栏、数据表、分页和导出组件。

## 2026-09-08：定期检查整改

- 数据导入改为先检查原始表头；默认拒绝重复列。当前 Species 源文件仅通过 manifest 显式启用 `coalesce_equal_selected`，并且只有在所选 CRR 样本的重复特征值逐项相等时才合并，冲突时终止导入。
- 数据版本保留会保护所有已发布分析引用的 revision；数据库清理先提交，后续文件删除失败只记录错误，不再回滚或破坏当前已发布版本。
- PCA 与 PERMANOVA 对零样本间变异、零组内距离方差返回明确的不可解释状态，前端不再把退化结果显示为 0% 方差或普通检验结果。
- MAG 分类下载溯源加入实际 rank 和展示分类；正式统计 worker 响应校验 job、方法、公式、alpha 与特征集合，并由 R worker 回传 job ID。
- 所有图表 HTML tooltip 动态文本统一转义，共享 tooltip 写入点再做允许列表净化；CSV 导出将公式前缀文本转为惰性单元格，保留数值类型。
- MySQL 可再生投影 JSON 增加 TTL、单文件、总字节和文件数上限；显式样本和特征集合限制为 500 项，CORS origin 改为环境配置。
- CI 增加真实 MySQL 导入、analysis revision 绑定和 projection 用例；前端扩大工具层严格类型检查，修复 E2E 空状态与排序资源定位，并增加移动端“跳到当前分析结果”入口。
- R worker 的 renv 项目可以激活，但本机尚未恢复 ANCOMBC 与 MaAsLin2，因此正式模型 smoke test 仍需在依赖恢复后执行；Species/KO 上游 abundance scale 仍保持 unknown，等待来源证据。

## 2026-09-03：统一分析工作区与 CRR 样本范围

- 清理已被正式方案或当前实现替代的临时交接、旧问题调查和重复排序分析文档；同步精简文档索引，并将项目概览更新到 `mag_v2` 已接入的丰度、GTDB 分类和 CheckM2 质量能力。
- 将 MAG 解析接入统一分析工作区：复用群落分析的顶部栏、分析域切换和侧栏导航，`/analysis/mag` 兼容入口转向 `/analysis/abundance?domain=mag`；功能注释与跨队列复现继续禁用并标记“规划中”。
- 首页与分析域说明同步到 `mag_v2` 当前能力，明确已接入 MAG 丰度、GTDB 分类、CheckM2 质量和技术质控，不再沿用“分类、质量待核验”的旧状态。
- 数据导入清单新增 `sampleIdPrefixes` 约束；当前物种与 KO 发布范围统一限定为 CRA014435 的 185 个 `CRR` 样本（AD 122、NC 63），原始文件中的 ERR/SRR 列保留在本地源数据中，但在丰度校验与缓存生成前排除。
- 校验报告记录样本前缀和被排除列数，补充后端输入过滤测试、MAG API/数据校验测试、前端 MAG 工作区与完整结果入口测试，并同步 OpenAPI、类型和参考文档。

## 2026-09-02：MAG 分类与质量接入

- 从只读 `mag_v1`、GTDB-Tk 汇总和 CheckM2 报告生成完整 `mag_v2`，872 个代表 MAG 的分类与质量均实现一一映射；业务 API 仍不读取 `source_data`。
- 新增 `/api/mag/taxonomy`、`/api/mag/quality` 及完整 CSV 下载；数据指纹和溯源扩展到八个版本化输入。
- 前端启用 MAG 分类层级 Top 20 图和完整度×污染率散点图；MAG 功能注释与独立跨队列复现继续保持“规划中”，不展示模拟数据。
- GTDB-Tk/GTDB release 版本仍待补充；完整度≥90%、污染率≤5%仅标记为参考区间，不称为完整 MIMAG 高质量判定。

## 2026-08-31：MAG 首期丰度与完整结果入口

- 接入外部 `mag_v1` 五项稳定输入，增加只读校验 CLI、异常报告、版本指纹和范围缓存；不改写数据或原有物种/KO revision。
- 新增 `/api/mag` 和 `/analysis/mag`：丰度比较、候选分页、单 MAG 分布、样本热图、映射与超过丰度阈值的统计；统一样本筛选和 CSV/JSON 导出，不将人为阈值表述为生物学检出。
- 按完整 872 MAG 检验族做 BH-FDR，保留 CoverM 百分比、不闭合，明确未校正混杂和探索性解释边界。
- 复用 ChartFrame、ProjectionDisclosure、EChartBase、分页与导出；补充 MAG 图像格式/尺寸和可重建展示溯源。
- 接通既有完整结果后端的前端按需分页、搜索和全部匹配结果下载入口。
- 当时 MAG 分类、CheckM2、dRep、覆盖深度等资料尚未接入；分类和 CheckM2 已于 2026-09-02 通过 `mag_v2` 接入，dRep 跨队列语义与覆盖深度仍未接入。MAG 暂不写入原有持久化 ProjectionAudit。

## 2026-08-20：第二阶段开发收尾

- 完成分析范围、图表专属计算策略、默认结果和投影缓存的结构化建设。
- 完成完整结果、当前图表数据、当前展示数据和筛选合并审计的职责分层。
- 完成箱线图连续浏览、待应用选择、范围物种目录和按所选列计算等性能优化。
- 完成后端完整结果分页、流式 CSV 以及默认/临时投影生命周期管理。
- 统一图表卡片、明细入口和导出能力契约，交互控件不再进入导出图像。
- 独立完整结果前端入口与科学元数据 Manifest 接入纳入下一阶段实施。
- 详细记录见 [2026-08-20 第二阶段开发收尾日志](2026-08-20-stage-two-closeout.md)。

## 2026-07-14：项目定位与分析入口更新

- 将 AD-Meta 明确定位为面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具。
- 首页按群落物种、群落功能、物种-功能联合和 MAG 解析四个稳定分析域展示当前能力与扩展方向。
- 首页补充从 Raw FASTQ、共同预处理到物种、KO 和 MAG 三条分析分支的完整技术路线。
- 统一“分析数据”“分析矩阵”和“结构化分析结果”等术语，避免将导入矩阵误称为研究数据集或数据产品。
- 新增生物信息分析流程与分析数据接入参考资料，并同步更新项目概览和首页文案。
- 前端 32 项测试全部通过，生产构建成功。

## 2026-07-12：项目文档与架构说明整理

- 新增 `docs/project-overview.md`，记录 AD/NC 肠道宏基因组研究背景、数据来源、当前生信流程进度和仓库边界。
- 新增 `docs/architecture.md`，明确后端预计算、统一分类层级树、图表 projection、前端骨架和后续扩展规则。
- 新增 `docs/README.md` 作为统一文档索引。
- 将运行手册归入 `docs/guides/`，API 与数据库契约归入 `docs/reference/`，本轮更新和调查记录归入 `docs/development/`。
- 删除旧版前端直读 Excel 的历史参考，避免后续开发误用已经废弃的架构。
- 补充 Windows PowerShell 启动命令，并把正式分类层级接口更新为 `taxonomy` 与 `taxonomy_sankey`。
- 新增 `docs/development/taxonomy-visualization-development.md`，系统记录旭日图、矩形树图、桑基图和放射树图的数据、交互、标签与响应式优化。

## 2026-07-03：后端图表计算模块拆分

- 将 `backend/app/compute/precompute.py` 从集中式主计算文件拆分为轻量调度器。
- 新增 `backend/app/compute/charts/`，按图表类型维护丰度对比、组成图、箱线图、热图、KO 检出率、KO LDA、旭日图、PCA/PCoA 和 summary 计算逻辑。
- 新增 `common.py`、`io.py`、`table.py`，分别承载共享常量、读写/JSON 序列化、输入表标准化。
- `taxonomy.py` 继续作为共享分类名称处理工具，保留 `get_level`、`short_name`、`taxonomy_chain`，不按图表重复拆分。
- `precompute.py` 保留原有函数名导出，兼容现有导入路径；HTTP API、缓存 JSON 字段、数据库结构和前端调用方式不变。
- 本次为纯内部重构，不提升 `COMPUTE_VERSION`，现有缓存不需要强制重建。

## 2026-06-15：AD/NC 合并聚类热图

- 保留原有 AD、NC 和差异热图，在两个分组热图下新增一张 AD/NC 全样本合并热图。
- 合并热图对全部样本共同执行 Euclidean distance + average linkage 层次聚类，允许 AD/NC 样本交叉排列。
- 合并图底部显示差异物种聚类树，右侧显示样本聚类树，并用红色 AD、绿色 NC 分组条标识每一行。
- `heatmap` 缓存新增 `combinedRowOrder` 和行列 `dendrograms` linkage 数据；前端复用原矩阵，不重复传输完整丰度数据。
- 合并图继续支持悬停详情、点击放大、缩放和 PNG 导出；旧缓存缺少树数据时保留原三张图并提示重新预计算。
- `COMPUTE_VERSION` 提升为 `2026-06-15-v2`，物种数据需要重新导入以生成新缓存。

## 对比基准

- 生成时间：2026-06-05 17:31:36（Asia/Shanghai）
- 远程仓库：`git@github.com:xray-hjy/AD-Meta.git`
- GitHub `main` 基准提交：`66871269300d6927c603ad801c4498572b8fe3ce`
- 基准版本说明：`feat: improve heatmap performance and composition summaries`
- 当前本地状态：基于 GitHub 最新 `main`，包含尚未推送的 KO LDA 展示优化、分类组成图交互增强、导入兼容修复和文档整理。
- 数据策略：真实数据、缓存和 SQLite 数据库仍保存在 `backend/storage`，继续被 `.gitignore` 排除，不上传到 GitHub。

## 核心功能更新

- KO LDA 图从全局 Top 30 改为显著性优先的分组平衡展示：AD 显著 KO 最多 15 个，NC 显著 KO 最多 15 个。
- KO LDA 图改为左右发散柱状图：NC 富集向左，AD 富集向右；tooltip 和标签仍显示正数 LDA 值。
- LDA payload 新增 `filter.selectionMode/perGroupTopN` 和 `summary`，用于解释显著 KO 总数、AD/NC 富集数量和当前展示数量。
- 分类旭日图新增右上角 `切换` 按钮，可在旭日图和矩形树图之间切换，并使用 ECharts `universalTransition` 实现平滑过渡。
- 旭日图保留圆角扇区、明亮分类色板和智能标签；矩形树图增加极细白色边框、顶部避让标题、hover 闪烁收敛处理。
- 导入命令支持从已有 `backend/storage/raw/.../raw.csv` 原位重新预计算，避免源文件和目标 raw 文件相同时触发 `SameFileError`。

## 前端更新

- `KoLdaBarChart` 增加旧 payload 回退逻辑：如果后端缓存没有 `summary`，前端会从 `items` 计算展示数量。
- `SunburstChart` 现在同时支持 `sunburst` 和 `treemap` 两种视图，共用同一份层级数据和同一个 ECharts series id。
- 矩形树图配置为 `roam: false`、`nodeClick: undefined`、`breadcrumb.show: false`，保持只读展示。
- 为减少矩形树图右下角 hover 闪烁，`universalTransition` 只在点击切换后的短时间内开启，tooltip 设置为不拦截鼠标事件。

## 后端与 API 更新

- `compute_ko_lda` 先计算所有 `p < 0.05` 的显著 KO，再按 AD/NC 分组排序并各取最多 15 个。
- AD/NC 组内排序规则保持为 `ldaScore desc -> pValue asc -> koId asc`；任一组不足 15 个时不使用不显著 KO 或另一组额外 KO 凑数。
- `docs/reference/api.md` 新增 `/api/datasets/{slug}/charts/lda` 契约，说明分组平衡选择、summary 字段和 items 字段。
- `import_dataset` 增加同文件保护，当导入源已经是目标 raw 文件时跳过 copy，直接重新预计算。

## 文档更新

- 新增 `README.md`，作为项目文档入口，说明当前架构、主要文档和数据分发方式。
- 旧版前端直读 Excel 的历史参考已在文档重组中移除，当前开发以 React、API 和预计算缓存架构为准。
- 更新日志默认以 GitHub 当前最新 `main` 为基准，记录本地待推送版本相对远程的新增变化。

## 测试与验证

- 新增/更新后端测试覆盖：
  - KO LDA 按 AD/NC 分组各取最多 15 个。
  - AD 组不足 15 个时不回填不显著 KO 或额外 NC KO。
  - LDA `filter` 与 `summary` 字段正确。
  - 从已有 raw 文件原位重新导入不会触发 `SameFileError`。
- 新增/更新前端测试覆盖：
  - AD LDA 柱为正值，NC LDA 柱为负值。
  - LDA 摘要条显示显著 KO、AD/NC 富集数和当前展示数。
  - 旧 LDA payload 缺少 `summary` 时仍可回退渲染。
- 本次推送前固定验证命令：
  - `cd backend && .venv/bin/python -m unittest tests.test_precompute tests.test_dataset_service tests.test_heatmap_api tests.test_import_dataset -v`
  - `CI=1 npm --prefix frontend test -- --runInBand --watch=false`
  - `npm --prefix frontend run build`

## 数据与协作说明

- 本地已重新预计算 `ad-nc-ko-abundance` 的 LDA 缓存，当前缓存展示结果为 `AD 7 + NC 15`。
- `backend/storage` 仍被 `.gitignore` 排除，重新生成的缓存、SQLite 数据库和原始数据不会进入 GitHub。
- 同事需要查看同样数据效果时，继续通过硬盘拷贝整个 `backend/storage` 目录。

## 注意事项

- 本次推送包含源码、测试和文档，不包含真实数据、缓存、构建产物或依赖目录。
- 推送前需确认 `backend/storage`、`frontend/build`、`frontend/node_modules`、`backend/.venv`、`__pycache__` 和 `.DS_Store` 没有进入暂存区。
