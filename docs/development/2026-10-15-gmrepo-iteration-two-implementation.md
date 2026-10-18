# GMrepo 迭代二实施：研究事实、有效复核与固定评估

日期：2026-10-15。依据[迭代二方案 v1.2](2026-10-15-gmrepo-evidence-iteration-two-plan.md)。状态：首批来源样板、14 项初筛去向、有效复核技术链、对象解释与固定评估/读回包已实施；扩展来源清点、人工科研复核和完整可重算发布包未全部完成。

## 1. 本轮改变了什么

保留原有无侧栏工作区、主分析主题和全部图表。固定处理包 `2026-10-09-v1` 及 fingerprint `68f003174b519a9aa8ec401a8e42223bf9e4b67aa26fe4b370b4b5b2e33f2971` 未改写；仍为 13 项接入、1269 Run、800 完整 profile、322 属，5 个分布队列、2 个具备现有队列内方法资格的队列。

本轮不是新增临床 AD 队列或新统计方法，而是补真实研究内容、明确用途，并把核查和导出从可展示推进为可追溯。

## 2. 三项样板与 14 项处理去向

补充登记升级为 schema 2，schema 1 仍可读取。登记文件为 `backend/metadata/gmrepo_research_registry.json`，版本 `gmrepo-research-ledger-2026-10-15-v2`。

| 样板 | 本轮补充事实及来源 | 用途边界 |
| --- | --- | --- |
| PRJEB51982 | 新取 ENA 项目；沿用封存的 Vogt 原论文，登记研究名称、Wisconsin 队列、粪便材料、AD/匹配对照、16S V4 和原处理方法 | 原研究身份依据继续生效；匹配对照不等于当前公开个体配对关系齐全 |
| PRJEB59009 | 新取 ENA 项目；沿用 Troci 原论文，登记 Kiel/Flensburg 招募、粪便/口腔材料区别、AD/MCI/风险/对照与 16S V1–V2 | 当前包只取粪便，AD/NC 子集不混入其他阶段；不猜测原性别代码含义 |
| PRJEB77146 | 新取 ENA 项目及 Europe PMC 原论文全文；原研究直接声明该 accession，定位到 GERO 基线、Santiago 智利人群、粪便及 16S V4 | 老年认知主诉人群，明确排除已诊断痴呆；不是临床 AD/NC，也不自动认定临床前 AD；未导入丰度 |

样板的原研究关联编号有 ENA/原论文依据；它们不是“独立验证研究”编号。论文中的原始招募人数和当前运行包的图表分母分别记录。

第一手来源：

- [Vogt 原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5648830/)；[ENA PRJEB51982](https://www.ebi.ac.uk/ena/browser/api/xml/PRJEB51982)。
- [Troci 原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC10776369/)；[ENA PRJEB59009](https://www.ebi.ac.uk/ena/browser/api/xml/PRJEB59009)。
- [GERO 原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC13082655/) 的 2.1 Cohort、2.3 Sample collection、2.5 Sequencing、Data Availability；[ENA PRJEB77146](https://www.ebi.ac.uk/ena/browser/api/xml/PRJEB77146)。该文功能分析为 16S 推断，不能作为 WGS 实测功能接入。

14 项均有可核对的初筛去向：5 项当前参考可用（其中只有 2 项可检验）、2 项阶段/相关认知参考、1 项待取得可用 profile、6 项资料不足。其余项目的去向依据现有封存规则/元数据整理，不宣称本轮已重新核实全部原论文。筛查去向、是否安装、分布资格、检验资格和科研复核是不同状态。

样板事实保留字段级来源与定位，状态为“已登记依据，待复核”；没有生成生产科研批准或虚构审核人员。原始来源描述和论文候选仍单列，不能覆盖既有专项身份依据。

## 3. 本次新抓取与发布保护

- 重新获取官方表型清单、项目元数据、全部 Run 分页及 AD 静态 TSV，归档到 `ADMetaData/reference/gmrepo/discovery/2026-10-15-v1`。两项表型分别实取 798/798、215/215 Run，并集仍为 14 项；AD 静态 TSV 8 项与 API 13 项的差异继续保留。
- 先生成候选清单和 `candidate-changes.json`，再显式执行 `--publish-existing`。当前轻量发现索引已更新到本批；旧发布索引保存在本批 `previous-published-registry.json`，并有 `publish-receipt.json`。
- 发布检查获取错误、非空范围、完整分页、回执路径和原件大小/哈希；失败不替换当前有效索引。索引采用临时文件原子替换，不允许重复发布覆盖旧索引备份。
- 三项项目 XML 与 GERO 论文原件在 `ADMetaData/reference/gmrepo/study-records/2026-10-15-v2`。最初请求因 Accept 不含 XML 返回 406，失败记录保留在 `2026-10-15-v1/receipts.json`；已修正 XML 请求头后另存新批，没有覆盖失败归档。
- 新研究事实引用共 8 个来源对象（4 个封存来源、4 个新获取原件）。本机读回 8 个均可校验；本次发现批次的 9 份原件也均通过大小和哈希检查。两组不能相加成“全部研究来源已齐全”。

本轮重新执行的是已知官方表型范围；未完成项目选择器契约、全关键词、未标注研究和 WGS 扩展。来源状态仍为 partial，不能因没有新增项目而写成全库完整。没有自动下载大型测序数据或运行 WGS 流水线。

## 4. 有效复核与事项处理

新增 EvidenceSource、FieldAssertion、范围绑定的 Review、更正链和 IssueResolution。实现位置为 `gmrepo_ledger_models.py` / `gmrepo_ledger_service.py`。

- 来源对象记录 URL、原件路径、大小、哈希、来源类型/获取日期；字段有具体定位。原件不可读或变化时不把字段显示为有效事实。
- schema 2 的非 pending 决定要求真实复核者/职责、日期、登记来源、全部 Run 集合、方法版本和比较内容指纹。
- 比较内容指纹除 Run 编号外，绑定完整元数据（含分组/协变量）、数据契约/规则、原专项身份审查作用范围、目标属目录和研究事实。仅编号相同不能沿用被改动的字段/方法意见。
- 更正通过 supersedes 指向同用途、同范围的旧记录。缺引用、循环、分支、跨用途/输入替代和冲突当前意见会使登记校验失败，而不是按文件中最后一条记录放行。
- 被替代意见保留为历史。有效恢复只解除其用途的暂缓；独立参与者、组数、设计矩阵和其他模型条件仍分别检查。
- 科研复核、字段复核与重叠审查各自生效；重叠意见只能表达限定范围和结果，不形成独立复现认证。事项填写“已解决”也不能绕过实际能力和有效意见判定。
- 补充原件缺失不自动推翻仍有效的旧专项依据。冻结时已明确缺失的补充材料，也不使原本可用的参考功能永久不可用；其可用性变化时另行提示重评。

生产登记中的 reviews 仍为空；技术测试的 Synthetic reviewer 只存在于测试夹具。当前科研复核、跨研究/主外独立性及主外数值可比性未获新增放行。

## 5. 对象级解释和原图表

`gmrepo_claims.py` 生成确定性解释，逐条绑定 claimId、规则版本、具体统计字段、比较内容、参考 fingerprint 和完整检验族。

分别说明描述可用但无检验、未调整结果、调整完整病例与效应单位、方向冲突、常量响应和模型不可估计。缺效应不记为零；秩效应为零不等于全零；未获 FDR 支持不等于没有关联。来源 LDA 与本项目重算仍分开，不做研究票数或总分。

目录可以检索研究名称/人群等已登记值；研究名称及原论文入口与项目编号并存。所选对象页的解释、研究登记和下方原分布保持同一队列，仍可回到来源研究核查。主物种/MAG 的固定版本及返回上下文保持。

## 6. 固定评估、导出和独立读回

`/evidence-summary` 增量接受固定主对象及原图范围，生成 evaluationId。快照存于配置的 storage_root 下 `gmrepo-evaluations/`，不改写主数据库或参考包。

固定记录包含：对象/主与参考版本、来源上下文、台账与发现索引、有效审查、比较集合和内容、完整结果/解释、相关代码指纹及 Python/NumPy/SciPy/statsmodels 版本。重复获取相同内容保留原生成时间与 ID；返回记录为独立副本。

页面、JSON 和带 evaluationId 的 Markdown 使用同一固定记录。`GET /evaluation-package?evaluationId=...` 提供固定 JSON 包。新登记或证据撤销不会改写旧结果；当前用途另行检查，必要时标记历史/阻断。无法读取或校验固定包时不回退重算当前报告。

当前 UI 仍从当前对象生成评估；没有建设历史评估列表/版本比较后台。历史包可通过 ID 读回及导出，历史记录不能作为当前仍有效的资格证明。无 ID 的旧报告接口保留原兼容行为，新页面使用固定 ID。

校验算法为显式版本 `gmrepo-tagged-json-number-v1`：保留 JSON 类型区分，对等值整数/浮点和负零规范化，避免浏览器重序列化把 1.0 写成 1 后误报校验失败。拒绝非有限值和超出浏览器无损范围的整数。此为本应用的声明格式，不宣称 RFC 8785；旧未声明算法的预览包按 python-json-v0 分支验证，不静默改换内容。

最小包可独立读取存储结果、核对哈希/ID；未打包原矩阵和全部科研来源，明确声明重新计算需要额外依赖。**这不是已完成的离线独立重算或完整科研发布认证。**

仓库根复查命令：

```powershell
node scripts/backend-python.mjs -X utf8 -m app.cli.validate_gmrepo_ledger
node scripts/backend-python.mjs -X utf8 -m app.cli.validate_gmrepo_evaluation G:/project/admeta/.tmp/gmrepo-evidence-qa/browser-evidence-export.json
```

新来源归档不在原运行 ZIP 中，迁移机器须另带这些原件及回执，或执行新的获取批次。缺原件时显示相应缺项，不用哈希字符串代替实际可读证明。

## 7. 验收与保留事项

验收包含 GMrepo 后端相关测试、前端页面/证据入口、目标 Ruff/mypy、OpenAPI、lint/typecheck/生产构建及真实浏览器。用真实参考包和主数据库核对物种 1937、MAG 分类路径、原图表、固定导出和返回状态；浏览器实际导出的 JSON 再交给独立 Python CLI 校验，而非只比较同一函数输出。

本轮最终验收结果：GMrepo 相关后端 63 项、前端 26 项、真实浏览器 16 个场景全部通过；目标 Ruff、9 个文件的 mypy、前端 lint/typecheck、OpenAPI 一致性与生产构建通过。后端测试有一项 Starlette/httpx 兼容弃用警告，不影响本轮结果。

浏览器使用真实主数据库，核对物种 1937 和 MAG `CRR1012739__CRR1012739_cleanbin_000002`，验证对象往返、队列/分布联动、主分析实际主题样式一致及 390px 页面无横向溢出。实际下载的 JSON 另经 Python CLI 校验通过（5 队列、322 属检验族）；这不等于离线重算。技术台账读回为 8 份研究原件、9 份发现原件校验成功，科研复核仍为 pending。

浏览器验收记录在 `.tmp/gmrepo-evidence-qa/verification.json`，目录还包含桌面/390px 截图、真实 JSON/Markdown、固定包与浏览器实际下载文件。该目录是本机验收产物，不是承诺随部署包分发的科研归档。

尚待继续：其余项目的原研究事实逐项补证；关键词/阶段/材料/WGS 扩展；真正的科研方法与解释复核；研究/参与者重叠审查；包含足够输入的可重算交付包。主矩阵单位/归一化、功能归属和模型外部验证仍按原条件独立推进。
