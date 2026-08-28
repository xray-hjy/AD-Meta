# 完整分析结果与投影生命周期

## 目的

AD-Meta 将不可变分析结果、浏览器可视化投影和投影审计读模型分开管理。完整结果服务用于分页查询和下载真实结果；投影生命周期用于控制可重建派生产物的保留时间。二者都不得改变源 Artifact 或其数据修订。

## 完整结果服务

当前服务支持 `species_abundance` 与 `ko_abundance` Artifact，并直接读取不可变 revision 表，不经过图表 Top N、长尾合并或统计筛选。

### 分页查询

```text
GET /api/analysis-runs/{runKey}/artifacts/{artifactKey}/results
```

支持以下查询参数：

| 参数 | 含义 |
| --- | --- |
| `query` | 在样本、特征名称、分类或 KO 注释中检索 |
| `sampleCode` | 精确筛选样本编号 |
| `phenotype` | 精确筛选分组 |
| `featureId` | 精确筛选稳定特征 ID |
| `sortBy` | `sampleCode`、`phenotype`、`featureId`、`featureName` 或 `abundance` |
| `sortDirection` | `asc` 或 `desc` |
| `limit` | 单页 1–500 行 |
| `offset` | 分页偏移量 |

响应返回来源运行、Artifact、数据修订、列定义、分页行、总行数、筛选条件和排序条件。`storageSemantics.projectionApplied=false` 是完整结果与交互投影之间的机器可读边界。

### CSV 下载

```text
GET /api/analysis-runs/{runKey}/artifacts/{artifactKey}/results/download
```

下载接口接受与分页查询相同的筛选和排序参数，并以流式 CSV 返回所有匹配行，避免在应用进程内一次装载完整文件。

### 稀疏矩阵语义

丰度 revision 采用稀疏存储：接口返回数据库中实际保存的非零行，未保存的样本与特征组合表示零值。接口不会为了形成稠密矩阵而合成海量零值行，也不会删除或聚合已保存行。因此“仅返回存储行”是无损存储语义，不是浏览器筛选。

## 投影缓存生命周期

投影审计 Artifact 是可由源结果和确定性参数重建的派生读模型，不是第二份科学事实。生命周期按投影身份自动分类：

| 类别 | 判定 | 保留策略 |
| --- | --- | --- |
| `default` | 标准全样本/AD/NC 范围、无自定义选择、采用图表默认参数与默认 Top N | 不设自动过期时间，供预热与常用访问复用 |
| `temporary` | 自定义样本子集、单样本、自定义特征、非默认参数或非默认 Top N | 滑动过期；每次命中刷新访问时间和过期时间 |

持久化字段：

- `retention_class`：`default` 或 `temporary`。
- `last_accessed_at`：最近一次创建或复用时间。
- `expires_at`：临时派生产物的过期时间；默认产物为空。

后台清理任务在数据库迁移成功后启动，按固定间隔批量删除已过期的审计 Artifact。关联审计行通过外键级联删除。清理不会删除 `AnalysisRun`、源 Artifact、数据修订或完整分析结果。

可通过环境变量调整：

| 环境变量 | 默认值 | 含义 |
| --- | ---: | --- |
| `AD_META_PROJECTION_CACHE_TTL_HOURS` | `168` | 临时投影滑动过期时长 |
| `AD_META_PROJECTION_CACHE_CLEANUP_INTERVAL_SECONDS` | `3600` | 自动清理间隔 |
| `AD_META_PROJECTION_CACHE_CLEANUP_BATCH_SIZE` | `500` | 单次最多清理的 Artifact 数 |

为避免误删无法可靠判定身份的历史记录，迁移前已有且 `expires_at` 为空的记录会被保守保留；它们在按新计算身份重建后进入正式生命周期。

## 工程约束

1. 完整结果查询只能读取不可变 revision 数据，不得调用图表投影生成器。
2. 完整结果分页、筛选和排序由数据库完成，前端不得一次装载全部矩阵。
3. 投影缓存键必须继续包含数据修订、样本范围、图表参数和计算版本。
4. 缓存命中与未命中必须产生完全一致的科学结果。
5. 新增 Artifact 类型时，应先声明稳定行模型和稀疏/稠密语义，再开放完整结果接口。

## 当前边界

本次完成的是后端分页查询、流式下载与派生投影生命周期。前端独立“完整分析结果”入口和论文级图像导出仍是后续能力；它们应调用本服务，不复用“当前图表数据”或“当前展示数据”。
