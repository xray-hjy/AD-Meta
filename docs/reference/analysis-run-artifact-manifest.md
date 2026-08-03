# AnalysisRun、Artifact 与 Manifest 数据契约

## 文档状态

- 状态：设计草案
- 契约版本：`0.1`
- 适用范围：生物信息分析组、标志物挖掘组与 AD-Meta 之间的分析结果交付
- 当前实现：尚未建立正式数据库表和公开 API；本文件用于统一后续设计与开发语言

## 设计目标

AD-Meta 不直接运行上游完整生物信息流程，也不要求其他小组直接写入平台数据库。上游分析完成后，应以统一的数据契约交付结构化结果，由 AD-Meta 负责校验、登记、预计算和发布。

该契约需要解决以下问题：

- 明确一次结果由哪批样本、哪套流程和哪些参数产生；
- 明确每个文件的科学含义、格式、版本和完整性；
- 防止新分析结果覆盖旧结果；
- 支持物种、KO、MAG、候选 AMP 和生物标志物结果逐步接入；
- 使后端能够自动判断哪些分析模块具有真实数据；
- 使模型结果可以追溯到对应的输入数据和分析版本。

## 核心概念

### AnalysisRun

`AnalysisRun` 表示一次可识别、可追溯的分析运行。例如，同一批样本使用某一版本生信流程完成的一次分析，或者标志物组基于某一版特征矩阵完成的一次模型训练与验证。

同一批样本更换流程版本、参考数据库、参数或输入数据后重新运行，应创建新的 `AnalysisRun`，不得覆盖旧运行。

建议至少记录：

| 字段 | 含义 |
| --- | --- |
| `id` | 全局唯一的分析运行编号 |
| `type` | `metagenomics`、`biomarker` 等运行类型 |
| `studyId` | 所属研究或队列编号 |
| `pipeline` | 流程或算法名称 |
| `pipelineVersion` | 流程或算法版本 |
| `status` | 运行状态 |
| `sampleCount` | 纳入样本数 |
| `startedAt` / `finishedAt` | 开始与完成时间 |
| `parameters` | 影响科学结果的关键参数 |
| `referenceVersions` | 参考数据库及其版本 |
| `parentRunIds` | 该运行依赖的上游运行编号 |

### Artifact

`Artifact` 表示某次 `AnalysisRun` 产生的一个结构化结果或文件。它可以是丰度矩阵、质量评价表、模型文件，也可以是报告或预计算结果。

建议至少记录：

| 字段 | 含义 |
| --- | --- |
| `id` | 产物唯一编号 |
| `type` | 产物类型，如 `species_abundance` |
| `path` | 文件在交付包或受管存储中的位置 |
| `format` | `parquet`、`tsv`、`json`、`fasta` 等格式 |
| `schemaVersion` | 该产物数据结构的版本 |
| `checksum` | 文件完整性校验值，默认使用 SHA-256 |
| `sizeBytes` | 文件大小 |
| `recordCount` | 可选，记录数或矩阵维度摘要 |
| `metadata` | 与该产物相关的补充说明 |

首批建议支持的产物类型：

| 领域 | Artifact 类型 | 当前状态 |
| --- | --- | --- |
| 公共元数据 | `sample_metadata` | 已有数据，可优先规范化 |
| 群落物种 | `species_abundance`、`taxonomy_annotation` | 已接入，现阶段为宽表导入 |
| 群落功能 | `ko_abundance`、`ko_annotation` | 已接入，现阶段为宽表导入 |
| 数据质量 | `qc_summary`、`multiqc_report` | 待接入 |
| MAG | `mag_catalog`、`mag_quality`、`mag_taxonomy`、`sample_mag_abundance`、`mag_ko` | 规划中 |
| 候选 AMP | `amp_catalog`、`sample_amp_abundance`、`amp_mag_links` | 规划中 |
| 标志物 | `biomarker_candidates`、`model_metrics`、`feature_scores`、`model_artifact` | 规划中 |

### Manifest

`Manifest` 是一次交付的入口文件。它声明契约版本、`AnalysisRun` 信息、样本范围和全部 `Artifact`，相当于分析结果的标准交付清单。

AD-Meta 应先验证 Manifest，再读取具体产物。平台不应依赖文件名猜测文件含义。

## Manifest 示例

```json
{
  "schemaVersion": "0.1",
  "analysisRun": {
    "id": "bioinfo-2026-07-28-001",
    "type": "metagenomics",
    "studyId": "ad-public-cohort-001",
    "pipeline": "ad-meta-bioinfo-pipeline",
    "pipelineVersion": "1.0.0",
    "status": "completed",
    "sampleCount": 373,
    "startedAt": "2026-07-27T08:00:00+08:00",
    "finishedAt": "2026-07-28T10:30:00+08:00",
    "parameters": {},
    "referenceVersions": {
      "taxonomy": "database-version-to-be-declared",
      "ko": "database-version-to-be-declared"
    },
    "parentRunIds": []
  },
  "artifacts": [
    {
      "id": "artifact-sample-metadata-001",
      "type": "sample_metadata",
      "path": "sample_metadata.tsv",
      "format": "tsv",
      "schemaVersion": "0.1",
      "checksum": "sha256:replace-with-real-value",
      "sizeBytes": 0
    },
    {
      "id": "artifact-species-abundance-001",
      "type": "species_abundance",
      "path": "species_abundance.parquet",
      "format": "parquet",
      "schemaVersion": "0.1",
      "checksum": "sha256:replace-with-real-value",
      "sizeBytes": 0,
      "metadata": {
        "shape": "Sample x Species",
        "abundanceScale": "must-be-declared"
      }
    },
    {
      "id": "artifact-ko-abundance-001",
      "type": "ko_abundance",
      "path": "ko_abundance.parquet",
      "format": "parquet",
      "schemaVersion": "0.1",
      "checksum": "sha256:replace-with-real-value",
      "sizeBytes": 0,
      "metadata": {
        "shape": "Sample x KO",
        "abundanceScale": "must-be-declared"
      }
    }
  ]
}
```

示例中的数据库版本、丰度尺度、校验值和文件大小必须由实际流程填写，不得保留占位内容用于正式发布。

## 接入流程

```text
上游小组完成分析
    ↓
生成 Manifest 与 Artifact 交付包
    ↓
AD-Meta 校验契约、文件、样本和校验值
    ↓
登记 AnalysisRun 与 Artifact
    ↓
导入标准化数据并执行后端预计算
    ↓
生成不可变结果版本
    ↓
发布对应前端分析模块
```

建议的运行状态：

```text
received → validating → validated → computing → published
                    ↘ rejected       ↘ failed
```

只有状态为 `published` 的运行可以成为前端默认分析版本。失败或被拒绝的运行必须保留错误信息，但不得进入正式展示。

## 校验规则

第一版至少执行以下校验：

1. `schemaVersion` 必须是 AD-Meta 支持的版本。
2. `AnalysisRun.id` 和 `Artifact.id` 必须唯一且稳定。
3. Manifest 中声明的文件必须存在，路径不得越过交付包根目录。
4. 文件大小和 SHA-256 必须与声明一致。
5. 样本编号在元数据与各丰度矩阵中必须能够对应。
6. AD/NC 分组值、缺失值策略和丰度尺度必须显式声明。
7. MAG、AMP 和标志物产物必须引用真实存在的上游运行或产物。
8. 模型运行必须记录训练、验证和外部测试划分，特征筛选不得使用测试集信息。
9. 任何未知产物类型或未知字段版本都应拒绝自动发布，而不是静默忽略。

## 小组职责边界

### 生物信息分析组

- 维护独立生信流程和工具环境；
- 生成符合约定结构的分析产物；
- 记录流程、参数、数据库版本和样本范围；
- 生成真实校验值并完成交付前自检。

### 生物标志物挖掘组

- 引用明确的上游 `AnalysisRun` 和输入 Artifact；
- 记录数据划分、预处理、特征选择、模型版本和随机种子；
- 交付模型指标、候选特征、稳定性和贡献结果；
- 不以图片或无法追溯的零散表格代替结构化结果。

### AD-Meta

- 维护 Manifest JSON Schema 和各 Artifact 数据结构；
- 校验、导入并版本化上游交付结果；
- 管理元数据、产物位置、哈希和发布状态；
- 预计算统计结果与可视化 payload；
- 只向前端开放具有真实已发布数据的分析模块。

其他小组不应直接写入 AD-Meta 数据库。AD-Meta 也不应在 FastAPI 请求进程中直接运行完整生信流程。

## 与当前系统的关系

当前 `datasets`、`dataset_revisions` 和 `revision_chart_artifacts` 已经具备“版本化数据与预计算产物”的基础，但现有模型主要面向单张物种或 KO 丰度表。

后续应在保留不可变 revision 思路的基础上，引入跨领域的 `AnalysisRun` 和通用 `Artifact` 概念，并建立其与研究队列、样本、数据修订版本及模型运行的关联。正式实施前需要单独评审数据库迁移、Manifest JSON Schema 和 API 版本，不应仅通过在现有图表 payload 中追加字段完成扩展。

## 后续实施顺序

1. 与生信组和标志物组共同确认第一版交付文件及字段。
2. 为 Manifest 编写可机器校验的 JSON Schema。
3. 定义 `sample_metadata`、`species_abundance` 和 `ko_abundance` 的第一版 Artifact Schema。
4. 使用现有物种、KO 数据制作一个真实示例交付包并验证导入流程。
5. 设计 `AnalysisRun`、`Artifact` 及关联表的数据库迁移。
6. 增加导入命令、校验报告和只读 API。
7. 再逐步增加 MAG、候选 AMP 和生物标志物产物类型。
