# 同一队列下的 MAG 原文件导入与结果管理

2026-10-20 起，MAG 正式入口使用 raw 原文件、独立解析器和数据库中的队列分析记录。
运行时不导入历史 MAG 包加载器，不读取 `development_input`，不使用 `mag_vN` 环境配置。

## 身份及存储

当前队列键是 `prjca022804-ad-nc`：项目 PRJCA022804 / 研究 CRA014435 的 185 例 AD/NC 样本。
项目编号本身不等于队列纳入条件；新增其他亚组或数据来源应另行声明样本集合。
物种、群落 KO 和 MAG 是同一队列中的不同结果模块，不能混用其分析对象与丰度单位。

- `backend/storage_manifest.json` 的 `cohorts` 显式声明队列、共享样本、模块输入和解析器。
- `backend/storage/raw/ad-nc-mag/PRJCA022804/` 保存从服务器整理目录复制的工具原文件。
- `backend/storage/raw/source-metadata/PRJCA022804/` 保存独立取得的共用样本元数据。
- raw 原件不被导入器改写。新运行的不同内容应保存在新的明确子目录，更新输入声明，不能覆盖旧原件。
- 数据库的 `cohorts`、`cohort_releases` 管理稳定身份与正式分析记录；物种/KO 的已发布修订也被固定引用，并核对样本编号和标签。
- `cohort_artifact_revisions` 按模块记录来源、解析器、状态和报告；`cohort_artifact_records` 记录带自然主键的分类、质量、关系、功能与树结果。
- 稠密样本—MAG 丰度单独存为数值关系 `cohort_mag_abundances`，不在请求时读取 raw 或 pickle。
- `cohort_import_jobs` 保留成功、失败及只校验的记录；详细报告写入 `backend/storage/provenance/cohorts/`。

## 首次接收与导入

代码、物种/KO 小表、共享样本资料、MAG 说明与文件清单走 Git。
组员从硬盘复制 MAG 数据至约定 raw 目录，保留相对路径。仅有代码时允许使用物种/KO，不会回退到旧 MAG 包。

```powershell
# 项目根目录；接收副本后可独立核对，不需要数据库
backend/.venv/Scripts/python.exe scripts/verify-mag-archive.py backend/storage/raw/ad-nc-mag/PRJCA022804

# 创建/升级数据库并导入：先按既有 runbook 配置 MySQL
npm run import:cohort -- --dataset prjca022804-ad-nc

# 仅校验当前声明的原文件，不发布新结果
npm run import:cohort -- --dataset prjca022804-ad-nc --validate-only

# 核对已发布数据库结果，不依赖 raw 挂载或历史交付包
npm run validate:mag -- --dataset prjca022804-ad-nc
```

默认入口只需 `.env` 中的 `AD_META_MAG_DATASET=prjca022804-ad-nc`。
页面也可以选择其他已经导入的队列和正式分析记录。
导入入口统一为 `import:cohort`；旧版本数据包及其导入命令已移除。

`npm run prepare:runtime` 在完成已有物种/KO准备后，会在必需 raw 文件齐备且没有已发布 MAG 记录时首次导入。
已发布队列不会因启动服务自动重导；多进程部署先单独执行准备命令。

## 解析与语义

| 模块 | 输入及校验 |
|---|---|
| samples | 按 CRR 联合已核对标签与独立元数据；疾病标签冲突会失败，年龄/性别/批次可缺失 |
| abundance | CoverM 矩阵、长度、样本清单、映射汇总；校验集合、非负有限值、0–100 百分比、行和及 mapped+unmapped |
| coverage | 平均覆盖度、覆盖广度、reads 数、方差、reads/base；明确各自单位，与丰度集合对齐 |
| quality | CheckM2 全体候选记录；另关联代表集合，校验代表长度，完整度参考区间不等于完整 MIMAG 质量判定 |
| taxonomy | GTDB-Tk 原 summary；分类、参考 ANI/AF/MSA 与代表集合对齐，版本从 gtdbtk.json 取得 |
| lineage | Cdb/Wdb/Ndb 等原表；按代表 reference、成员 query 提取实际 ANI，来源样本与质量可追溯 |
| arg | DRAMMA 运行清单、命中/候选明细及汇总交叉核对；保留 Label、prob、passed 标记的各自含义 |
| bgc | 解析 regions.js 的 JSON 数据，不执行 JavaScript；与区域 GBK 数量核对，保存原 contig 的 0 起点半开区间 |
| phylogeny | IQ-TREE 最终 Newick；校验叶节点唯一并属于代表 MAG，不将丰度热图聚类树当作系统发育树 |
| metabolism | DRAM2 汇总 manifest、MAG 摘要、8 类 counts/presence、全基因表及 distill；逐类回算基因计数，与丰度/质量/分类核对后构建不可变功能索引库 |
| archive | 保存完整复制清单。pickle、FAA、iTOL、日志等附件保持归档，不伪装成全部已结构化解析 |

数字来自原文件，185、872、8548 等仅是本次审计结果，不是全局加载约束。
阈值参数取自运行记录；CoverM 百分比不重新闭合；HMM 命中和模型新候选分开统计。
BGC 成功且零命中、未提供、区域缺失分别记录；缺文件不补成零。
MAG 全序列不是当前已产出结果可视化的必需输入。DRAM2 已通过独立的 metabolism 模块接入，不用重新制作整套包。现有 distill 单 KO 行有差异，原表保留，研究专题查询已核对的基因计数，不报告完整通路。

## 发布、缓存与失败

模块修订包含队列、输入校验值、参数、解析器版本/代码校验值和上游依赖修订。
相同输入重复导入不会新增同一结果；关联元数据、代码或参数改变会得到新的自动修订。
一个分析记录固定各模块修订及物种/KO来源修订，历史分析记录保持可查询。

必需的样本或丰度校验失败时不发布，当前已发布结果保持原状。
可选模块缺少或校验失败时记录状态，其他已通过的模块可发布；不能把失败结果显示为有效数据。
树、ARG、BGC 等可独立补充；crosswalk 不再是 lineage 的依赖，没有经核对对应时不猜测映射。

API 的 `dataset` 指定队列，`release` 或现有图表参数 `revision` 指定正式分析记录；冲突返回 409。
图表请求和前端缓存固定结果指纹，统计缓存同时包含计算方法和样本范围。
发布后的数据库查询不访问 raw。原件下载则从该分析记录的来源清单解析路径，并再次核对校验值。

DRAM 功能查询额外依赖 `storage/derived/mag-functions/<sha256>.sqlite`。MySQL 模块报告固定该文件的哈希和大小；API 使用只读连接并核对文件，不在运行中自动重建。部署、备份与恢复必须同时包含 MySQL 和被引用的派生库，多进程/多实例需可读挂载该目录。raw 完整时可运行同一导入命令建立新发布；历史发布需要原来固定的文件，不要直接替换路径或删除仍被引用的文件。详见 [本次实施记录](../development/2026-10-23-mag-functional-implementation.md)。

## 扩展入口

解析器注册在 `app/services/mag_source_adapters.py` 的 `ADAPTERS`，每项明确依赖模块。
解析结果包含标准记录及报告，按已有原子发布流程存入数据库。新增工具不使用导入任意 Python 路径的配置。
新记录类型在存储主键声明和模块 API 白名单登记；新增视图读取模块状态后启用。
不同规模的队列可复用同一解析器，不在前端写死样本数、MAG 数或 manifest 哈希。
首次支持新工具格式时需补对应格式/关联校验；无法确认字段语义时不推断单位或生物学归属。

## 本次核对结果

已归档 3,440 个文件、1,126,012,366 字节。样本 185（AD 122、NC 63），代表 MAG 872，候选质量记录 9,133，dRep 成员 8,548。
ARG HMM 命中 79,392；新候选 passed_0.75 为 20,481、passed_0.95 为 3,834；BGC 区域 2,461；IQ-TREE 两棵树共 872 个叶节点。
导入回归包含重复导入、失败不改当前记录、元数据修订固定、缺失与零命中区分，以及禁止旧加载器/旧目录访问的接口核对。
旧版 MAG 表已由迁移清除；历史技术说明保留在开发日志中。当前应用不再使用版本包加载和配置方法。
