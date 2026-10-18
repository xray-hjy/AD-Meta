# AD-Meta 文档索引

文档按用途划分。开发时以代码和 API 实际行为为准；接口、数据库或架构发生变化时，应在同一次修改中更新对应文档。

## 项目说明

- [项目背景与边界](project-overview.md)：研究背景、数据来源、生信流程现状及仓库职责。
- [系统架构与扩展约定](architecture.md)：前后端结构、数据流、目录职责和新增可视化的规则。

## 使用指南

- [当前数据产品、开发职责与来源追溯](guides/data-products-and-provenance.md)：按部分样本跑通流程、后续服务器批量运行的背景，梳理数据用途、当前交付状态、前端职责和溯源缺口。
- [NGDC 元数据下载与当前样本核对](guides/ngdc-metadata-verification.md)：官方 476 个样本与当前 185 个样本的对应、文件下载清单、新旧元数据变化和待补资料。
- [生信脚本归档与版本证据核对](guides/bioinformatics-script-provenance.md)：历史脚本、用户提供的软件版本、已交付产物之间的对应，以及待补的成功运行记录。
- [服务器转交文件整理与剩余缺项](guides/server-transfer-audit.md)：本次从服务器取得的新脚本、成功日志、MAG 来源对应、物种矩阵差异与更新后的缺项清单。
- [本地运行与数据导入](guides/runbook.md)：环境安装、服务启动、数据导入、缓存重建和部署。
- [MAG 丰度、分类与质量接入](guides/mag-data.md)：外部数据配置、MySQL 导入、版本校验、MAG 工作区、统计边界和下载 API。

## 技术参考

- [GMrepo 完整迭代与验收](development/2026-10-17-gmrepo-complete-evidence-implementation.md)：126 份来源、全库 Run 粒度核对、185 样本/966 属派生、主外森林图与多候选、固定独立复算和本地部署支持包。

- [API 契约](reference/api.md)：公开只读接口与图表 payload。
- [GMrepo 参考数据接入](reference/gmrepo.md)：版本化处理包、队列质量、菌属箱线图/散点、身份审查、探索性检验和证据对照接口。
- [数据库契约](reference/database.md)：科学数据表、应用支撑表和导入约束。
- [AnalysisRun、Artifact 与 Manifest 数据契约](reference/analysis-run-artifact-manifest.md)：生信组、标志物组与 AD-Meta 之间的分析结果交付规范草案。
- [AD 宏基因组生物信息分析流程摘要](reference/bioinformatics-analysis-workflow.md)：从 Raw FASTQ 到物种、KO 和 MAG 分析结果的上游流程。
- [生物信息流程与分析数据接入](reference/bioinformatics-analysis-data.md)：分析数据接入边界、科学表述和 MAG 扩展约定。
- [图表分析策略与投影契约](reference/chart-analysis-policies.md)：分析范围、计算参数、展示上限及各类图表的专属科学策略。

## 开发记录

- [DiTing KO 与通路接入](development/2026-10-16-diting-functional-integration.md)：新版 9,537 个 KO、95 项通路、同批版本绑定，以及主分析风格的气泡图、森林图、雨云图与热图。
- [DiTing 十图型与 MAG 工具适配](development/2026-10-17-diting-pathway-gallery.md)：三个入口内切换十种图型，复用缩放、预览、摇杆、框选、科研样式和导出；支持完整 95 项选择、分面分页和热图转置。

- [MetaPhlAn 物种结果替换](development/2026-10-16-metaphlan-species-migration.md)：185 个样本保持不变，1,828 个种级特征、比例存储与百分比展示、新旧运行隔离及真实数据库验收。
- [GMrepo 收尾与验收](development/2026-10-17-gmrepo-closeout.md)：官方项目描述检索 1,238/1,349 项，18 项来源登记及误命中排除，58 份固定依据、185 个主样本来源说明，以及浏览器和离线复算检查。
- [GMrepo v1.3 本轮实施](development/2026-10-16-gmrepo-release-implementation.md)：历史实施记录；最新来源与验收见 2026-10-17 收尾记录。47 份登记来源、21 对范围关系、作者直接来源的 WGS 阶段分布、固定评估离线复算；按用户要求保持单一产品，撤下人员签署和待审任务展示，具体科学限制保留。
- [GMrepo 完整交付方案 v1.3](development/2026-10-15-gmrepo-evidence-release-plan.md)：已执行一轮，含最新单一产品边界修订；仍有原研究附件、主数据语义与参与者关系缺口。
- [GMrepo 迭代二实施](development/2026-10-15-gmrepo-iteration-two-implementation.md)：三项研究来源样板、14 项处理去向、有效复核/更正链、对象解释与固定评估/独立读回；扩展来源和科研复核仍有明确缺项。
- [GMrepo 外部证据迭代二方案 v1.2](development/2026-10-15-gmrepo-evidence-iteration-two-plan.md)：用户已确认执行；研究事实补齐、有效复核/更正链、对象解释与固定评估交付的验收安排。
- [GMrepo 研究台账与统一资格：迭代一实施](development/2026-10-15-gmrepo-research-ledger-implementation.md)：14 项台账、分用途缺项、撤销后缓存失效、来源读回及页面/报告贯通；科研复核与扩展清点未完成。
- [GMrepo 外部证据后续迭代方案 v1.1](development/2026-10-15-gmrepo-evidence-next-iteration-plan.md)：用户已确认执行；迭代一技术实施进展与后续来源补齐、对象解释/科研复核发布、条件化数值对照安排。
- [GMrepo 外部证据评估首版实施](development/2026-10-14-gmrepo-evaluation-implementation.md)：保留可视化并贯通物种/MAG、全宽工作区、官方分页资源清点、版本缓存、真实验收与科研缺项。
- [GMrepo 证据工作页前端整理](development/2026-10-15-gmrepo-ui-refinement.md)：主分析统一主题、可操作研究目录与菌属检索、队列质量/分布联动、对象跨页保持及改版验收。
- [GMrepo 外部证据评估模块优化实施方案 v1.0](development/2026-10-14-gmrepo-evidence-workspace-design.md)：首版设计基线与科学边界；当前实现见实施记录，后续增量安排见 v1.1。
- [GMrepo AD 外部参考证据接入与发布 SOP](development/2026-10-14-gmrepo-evidence-sop.md)：研究规则、系统检索、获取审查、标准化统计、解释发布、复核产物和评审材料（技术首版已实施，流程部分完成，待科研复核）。

- [20261013更新](development/20261013-update.md)：主分支与依赖分支整合、GMrepo 外部参考模块、固定版本运行包交付及验证记录。

- [20261011 CI 修复](development/20261011-ci-fixes.md)：依赖审计、MySQL 集成断言、覆盖率等待与浏览器回归修复。

- [20261010更新](development/20261010-update.md)：首页接入、立体图集与滚动衔接、五种分层 Logo 动画及前端维护目录整理。

- [2026-10-08 开发交接文档](development/2026-10-08-development-handoff.md)：新聊天接续入口，含当前状态、代码地图、数据口径、运行验证与开发经验。

- [20261008更新](development/20261008-update.md)：与仓库 main 最新版本对比的功能更新与优化清单。

- [2026-10-04 MAG 条形图连续导航与全部选择](development/2026-10-04-mag-bar-navigation.md)：全部 MAG、共用缩放/摇杆/预览、方向切换及完整集合导出。
- [群落数据集信息展示规则](development/community-data-description-design-draft.md)：物种与群落 KO 共用的结构化字段、版本绑定和内容边界。
- [2026-10-01 前端页面与实际数据核查](development/2026-10-01-frontend-data-audit.md)：各入口的数据用途与限制、实际页面核查、状态和样本范围问题，以及下一轮调整顺序。
- [综合更新日志](development/updates.md)
- [2026-08-20 第二阶段开发收尾日志](development/2026-08-20-stage-two-closeout.md)：汇总分析范围、科学展示规则、投影审计、箱线图性能和缓存生命周期，并记录纳入下一阶段实施的事项。
- [2026-08-13 箱线图选择与性能更新](development/2026-08-13-boxplot-selection-and-performance.md)
- [2026-08-13 PCA / PCoA 排序分析模块统一优化方案](development/2026-08-13-ordination-module-optimization-plan.md)：统一排序图容器契约，并规划 PCA 主成分贡献、PCoA 组内离散、特征值诊断、筛选审计和缓存资源。
- [2026-08-03 PCoA 稀有特征过滤与探索性推断更新](development/2026-08-03-pcoa-filtering-and-inference.md)
- [2026-08-01 投影筛选与合并明细更新](development/2026-08-01-projection-audit-details.md)
- [2026-08-02 投影审计读模型](development/2026-08-02-projection-audit-read-model.md)
- [2026-07-29 默认探索策略与投影缓存更新](development/2026-07-29-default-exploration-strategy.md)
- [KO 功能类别组成后续开发提醒](development/ko-functional-category-composition-follow-up.md)：记录当前 KO 相对贡献边界、未来版本化映射要求及完成后的清理项。
- [科学元数据后续实施提醒](development/scientific-metadata-follow-up.md)：记录丰度尺度、标准化方法、批次与协变量等待确认信息及未来 Manifest 接入要求。
- [2026-07-14 开发更新日志](development/2026-07-14-development-update.md)
- [2026-07-12 更新日志](development/2026-07-12-release-notes.md)
- [前端 UI 重构记录](development/frontend-ui-refactor-update.md)
- [分类层级可视化开发与优化记录](development/taxonomy-visualization-development.md)

`development/` 中的内容用于解释本轮开发决策，不作为稳定接口契约。旧版前端直读 Excel 的参考文档已经移除，当前实现只以 React、后端 API 和预计算缓存架构为准。
