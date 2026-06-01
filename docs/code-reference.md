# AD-Meta 代码功能详细讲解文档

> 说明：本文档记录的是前端直读 Excel、浏览器端计算图表的旧实现逻辑。
> 当前项目已经改为“后端预计算 + 前端只读 API 渲染”。新的接口契约以
> `docs/api.md` 为准，运行和导入流程以 `docs/runbook.md` 为准。

本文档覆盖 AD-Meta 项目中所有图表组件及数据预处理代码，按"功能概述 → 数据结构 → 核心算法 → 逐步实现"的结构逐一讲解，目的是让读者能够完全理解代码逻辑并人工复现。

---

## 目录

1. [数据加载与预处理](#1-数据加载与预处理)
2. [分类学字符串解析](#2-分类学字符串解析)
3. [统计计算工具](#3-统计计算工具)
4. [PCA 降维计算](#4-pca-降维计算)
5. [统计卡片组件](#5-统计卡片组件)
6. [丰度对比柱状图](#6-丰度对比柱状图)
7. [门级组成对比图](#7-门级组成对比图)
8. [丰度箱线图](#8-丰度箱线图)
9. [丰度热图](#9-丰度热图)
10. [分类旭日图](#10-分类旭日图)
11. [PCA 散点图](#11-pca-散点图)

---

## 1. 数据加载与预处理

**文件**: `frontend/src/data/useSpeciesData.js`

### 功能概述

React 自定义 Hook，负责从服务端加载 xlsx 格式的宏基因组丰度数据，解析后调用统计工具计算各图表所需的数据结构。

### 输入输出

| 项目 | 说明 |
|------|------|
| **输入参数** | `filePath` — xlsx 文件路径，如 `/data/AD_NC_species_abundance.xlsx` |
| **返回值** | `{ loading, error, samples, speciesCols, stats, barData, stackData }` |

### 数据结构说明

**原始 xlsx 表格格式**：
```
| Sample | Group | k__Bacteria\|p__Firmicutes\|... | k__Bacteria\|p__Bacteroidetes\|... | ... |
|--------|-------|-------------------------------|-----------------------------------|-----|
| S001   | AD    | 12345                         | 67890                             | ... |
| S002   | NC    | 23456                         | 78901                             | ... |
```

- `Sample` 列：样本编号
- `Group` 列：分组标签（"AD" 或 "NC"）
- 其余列：以 `k__` 开头的完整分类学路径，值为该物种在该样本中的丰度（浮点数）

### 处理流程（5步）

```
fetch(filePath)                     // Step 1: HTTP 下载 xlsx 文件
  → response.arrayBuffer()          // Step 2: 读取为二进制 ArrayBuffer
  → XLSX.read(buffer, {type:'array'})  // Step 3: xlsx 库解析为 workbook 对象
  → XLSX.utils.sheet_to_json(sheet, {defval:'0'}) // Step 4: 转为 JS 对象数组
  → 分离物种列 + 调用统计函数          // Step 5: 计算派生数据
```

**Step 4 关键细节**：`defval: '0'` 确保空单元格被解析为字符串 `'0'` 而非空值，避免后续 `parseFloat` 产生 `NaN`。

**Step 5 分离物种列**：
```js
const speciesCols = allCols.filter(col => col.startsWith('k__'));
```
只保留以 `k__`（kingdom 层级前缀）开头的列名，排除 `Sample`、`Group` 等元数据列。

### 派生计算

| 输出字段 | 计算函数 | 用途 |
|----------|---------|------|
| `stats` | `computeStats(samples, speciesCols)` | 统计卡片（总样本数、AD/NC例数、物种数） |
| `barData` | `computeTopSpecies(samples, speciesCols, 20)` | 丰度对比柱状图（Top 20 物种） |
| `stackData` | `computePhylumComposition(samples, speciesCols)` | 门级组成堆叠图（6 门 + Other） |
| `samples` | 原始数据直接透传 | 箱线图、热图、旭日图、PCA 的输入 |

---

## 2. 分类学字符串解析

**文件**: `frontend/src/utils/parseTaxonomy.js`

### 功能概述

将物种列名（完整的层级路径字符串）解析为结构化的分类学信息，并支持按层级提取名称。

### 输入格式

```
k__Bacteria|p__Firmicutes|c__Bacilli|o__Lactobacillales|f__Lactobacillaceae|g__Lactobacillus|s__Lactobacillus_acidophilus
```

以 `|` 分隔的 7 级分类，每段格式为 `{层级代码}__{名称}`。

### 层级映射

| 层级代码 | 英文名 | 中文名 |
|---------|--------|--------|
| `k` | kingdom | 界 |
| `p` | phylum | 门 |
| `c` | class | 纲 |
| `o` | order | 目 |
| `f` | family | 科 |
| `g` | genus | 属 |
| `s` | species | 种 |

### 三个导出函数

#### 2.1 `parseOne(taxonomyString)` — 全量解析

```js
parseOne("k__Bacteria|p__Firmicutes|c__Bacilli")
// 返回: { kingdom:"Bacteria", phylum:"Firmicutes", class:"Bacilli",
//         order:null, family:null, genus:null, species:null }
```

**实现逻辑**：
1. 初始化结果对象，所有字段为 `null`
2. 按 `|` 分割字符串得到各层级片段
3. 每个片段按 `__` 分割得到层级代码和名称
4. 通过 `LEVEL_MAP` 查找对应的英文字段名，写入结果对象

#### 2.2 `getLevel(taxonomyString, level)` — 按层级提取

```js
getLevel("k__Bacteria|p__Firmicutes", "p")
// 返回: "Firmicutes"
```

**实现逻辑**：
1. 按 `|` 分割
2. 遍历查找以 `{level}__`（如 `p__`）开头的片段
3. 用 `substring(prefix.length)` 去掉前缀，返回纯净名称

#### 2.3 `getShortName(taxonomyString)` — 生成展示短名

**优先级**：
1. 有属有种 → `"Lactobacillus_acidophilus"`
2. 只有种 → 返回种名
3. 只有属 → `"Lactobacillus_sp."`（不确定种）
4. 都没有 → 取最后一段去掉层级前缀

---

## 3. 统计计算工具

**文件**: `frontend/src/utils/statistics.js`

### 功能概述

对物种丰度数据进行分组统计：均值、标准差、占比计算，输出各图表组件需要的格式化数据。

### 3.1 基础统计函数

#### `mean(values)` — 算术平均值

```
mean = Σ(vi) / n
```

#### `std(values)` — 样本标准差

```
std = sqrt( Σ(vi - mean)² / (n - 1) )
```

使用 `n - 1`（贝塞尔校正），计算的是**样本标准差**而非总体标准差。

#### `computeSpeciesStats(samples, colName)` — 单物种分组统计

**算法**：
```
对每个样本 sample：
  如果 sample.Group === 'AD' → 加入 adValues[]
  如果 sample.Group === 'NC' → 加入 ncValues[]

返回 { adMean, adStd, ncMean, ncStd }
```

### 3.2 `computeStats(samples, speciesCols)` — 总览统计

遍历所有样本的 `Group` 字段，统计 AD 组和 NC 组的样本数量，返回：
```js
{
  totalSamples: 样本总数,
  adSamples:    AD组样本数,
  ncSamples:    NC组样本数,
  totalSpecies: 物种列数量
}
```

### 3.3 `computeTopSpecies(samples, speciesCols, topN)` — Top N 物种筛选

**算法流程**：

```
1. 对每个物种列 col：
   a. 调用 computeSpeciesStats 计算该物种的分组统计
   b. 计算 total = adMean + ncMean（总体丰度级别）
   c. 通过 getShortName(col) 生成展示名称
   
2. 按 total 降序排列

3. 取前 topN 个（默认20）

返回 [{ species, adMean, adStd, ncMean, ncStd, total }, ...]
```

### 3.4 `computePhylumComposition(samples, speciesCols)` — 门级占比

**算法流程**：

```
1. 初始化两个累加器：
   adPhylumSum = {}   // 门 → AD组累计丰度
   ncPhylumSum = {}   // 门 → NC组累计丰度
   adTotal = 0        // AD组总丰度
   ncTotal = 0        // NC组总丰度

2. 遍历所有物种列：
   a. 用 getLevel(col, 'p') 提取所属门名称
   b. 调用 computeSpeciesStats 获取该物种的分组丰度
   c. 将 adMean 累加到 adPhylumSum[phylum]
   d. 将 ncMean 累加到 ncPhylumSum[phylum]
   e. 更新 adTotal / ncTotal

3. 计算各门占比：
   adRatio = adPhylumSum[phylum] / adTotal
   ncRatio = ncPhylumSum[phylum] / ncTotal

4. 按 adRatio + ncRatio 降序排列

5. 只保留 Top 6，其余合并为 "Other"
   → 返回 [{ phylum, adRatio, ncRatio }, ...] 共 7 条
```

---

## 4. PCA 降维计算

**文件**: `frontend/src/utils/pca.js`

### 功能概述

对高维物种丰度数据执行主成分分析（PCA），降维到 2 维空间用于可视化。同时提供层次聚类排序工具供热图使用。

### 4.1 `buildMatrix(samples, speciesCols)` — 构建数值矩阵

将原始数据转换为 `n×p` 矩阵（n = 样本数, p = 物种数），同时提取分组标签。

```
matrix[i][j] = parseFloat(samples[i][speciesCols[j]]) || 0
labels[i]   = samples[i].Group
```

### 4.2 `standardize(M)` — Z-score 标准化

将每列（每个物种）标准化为均值为 0、标准差为 1 的分布：

```
μⱼ  = (1/n) · Σᵢ M[i][j]           // 第 j 列的均值
σⱼ  = sqrt( (1/n) · Σᵢ (M[i][j] - μⱼ)² )  // 第 j 列的标准差

如果 σⱼ < 1e-12（常数列）：
  σⱼ = 1  // 防止除零

标准化: X[i][j] = (M[i][j] - μⱼ) / σⱼ
```

**为什么需要标准化**：不同物种的丰度数值量级差异巨大（从几百到几百万），如果不标准化，高丰度物种会主导 PCA 结果。

### 4.3 `powerIteration(M, iters=80)` — 幂迭代求特征向量

求解矩阵最大特征值对应的特征向量（第一主成分方向）。

**算法**：
```
1. 初始化向量 v = [1, 1, ..., 1]，归一化：v = v / ||v||
2. 迭代 80 次：
   a. next = M · v           // 矩阵乘向量
   b. n = ||next||           // 向量的模
   c. 如果 n < 1e-12，提前终止
   d. v = next / n           // 归一化
3. 统一符号：如果 v[0] < 0，全部取反
4. 返回 v
```

**关键细节**：
- 初始向量是**全 1 归一化**（不是随机初始化），保证了结果可复现
- 统一符号使不同运行的结果具有一致的方向

### 4.4 `computeTop2PCs(X)` — 提取前 2 个主成分

这是 PCA 的核心算法：

```
1. 计算协方差矩阵 C = XᵀX / (n-1)
   其中 C[i][j] = 第 i 个物种与第 j 个物种的协方差

2. 用幂迭代求第一主成分 pc1
   λ₁ = pc1ᵀ · C · pc1   // 第一特征值（方差）

3. 收缩协方差矩阵（deflation）：
   C'[i][j] = C[i][j] - λ₁ · pc1[i] · pc1[j]
   这一步骤从协方差矩阵中移除第一主成分的贡献

4. 用幂迭代在 C' 上求第二主成分 pc2

5. 计算投影分数：
   scores[i] = [X[i] · pc1,  X[i] · pc2]
   // 每个样本在第一和第二主成分上的坐标
```

**deflation 的数学原理**：PCA 的主成分互相正交。移除第一主成分的贡献（`λ₁ · pc1ᵢ · pc1ⱼ`）后，幂迭代会自动找到与 pc1 正交的第二主成分。

### 4.5 `computePCA(samples, speciesCols)` — 主入口

```
1. buildMatrix → 构建 n×p 矩阵
2. standardize → Z-score 标准化
3. computeTop2PCs → 提取前2个主成分坐标
4. 计算解释方差比例：
   totalVar = Σᵢ Σⱼ X[i][j]²
   pc1Var   = Σᵢ scores[i][0]² / totalVar  // PC1 解释的方差占比
   pc2Var   = Σᵢ scores[i][1]² / totalVar  // PC2 解释的方差占比
5. 返回 { points: [{x, y, label, sample}], variance: [pc1Var, pc2Var] }
```

### 4.6 `hierarchicalClusterOrder(distMatrix)` — 层次聚类排序

使用**UPGMA（平均连接法）**对样本进行层次聚类，返回聚类后的行/列排列顺序。

**算法**：
```
1. 初始化 n 个单元素簇
2. 循环直到只剩 1 个簇：
   a. 计算所有簇对之间的平均距离
      d(A,B) = (1/|A|·|B|) · Σ_{a∈A} Σ_{b∈B} distMatrix[a][b]
   b. 合并距离最近的两个簇（取并集）
3. 返回最终簇的元素排列
```

---

## 5. 统计卡片组件

**文件**: `frontend/src/components/StatsCards.jsx` + `StatsCards.css`

### 功能概述

在页面顶部以 4 张卡片横排展示总览统计数字。

### 数据流

```
stats = { totalSamples, adSamples, ncSamples, totalSpecies }
  → 映射为 4 个 card 对象:
    [{ label:"总样本数", value: stats.totalSamples },
     { label:"AD组",    value: stats.adSamples    },
     { label:"NC组",    value: stats.ncSamples    },
     { label:"物种总数", value: stats.totalSpecies }]
  → 渲染为 4 个 flex 子元素
```

### UI 结构

```
div.stats-container (flex row, gap 16px)
  ├── div.stat-card (flex:1)
  │     ├── div.stat-value (32px, font-weight 700) — 数值
  │     └── div.stat-label (13px, muted)            — 标签
  ├── div.stat-card ...
  ├── div.stat-card ...
  └── div.stat-card ...
```

### 卡片顶部色条（CSS ::before 伪元素）

每张卡片顶部有 2px 高的装饰色条：
- 卡片 1（总样本数）：`var(--color-primary)` 铜色
- 卡片 2（AD组）：`var(--color-ad)` 红色
- 卡片 3（NC组）：`var(--color-nc)` 绿色
- 卡片 4（物种总数）：`var(--color-primary)` 铜色

---

## 6. 丰度对比柱状图

**文件**: `frontend/src/components/Charts/BarChart.jsx`

### 功能概述

用 D3.js 绘制水平分组条形图，展示 Top 20 物种在 AD 组和 NC 组的平均丰度及标准差（误差线）。

### 数据格式

```js
// props.data (barData)
[
  { species: "Lactobacillus_acidophilus", adMean: 12345, adStd: 2300,
    ncMean: 8700, ncStd: 1500 },
  { species: "Bacteroides_fragilis", ... },
  // ... Top 20
]
```

### 布局参数

| 参数 | 值 | 含义 |
|------|---|------|
| `MARGIN.left` | 160 | 左侧物种名称空间 |
| `MARGIN.right` | 120 | 右侧图例空间 |
| `BAR_HEIGHT` | 18 | 单条高度(px) |
| `GROUP_GAP` | 4 | AD/NC 两组的间距 |
| `groupH` | 40 | 每个物种占用的总高度 = 18×2+4 |

### 渲染步骤（D3 Data Join 模式）

**Step 1 — 计算 SVG 尺寸**
```
width  = 容器实际宽度（svgRef.current.clientWidth）
height = MARGIN.top + rows × groupH + MARGIN.bottom + 20
```

设置 `viewBox` 保证 SVG 缩放自适应。

**Step 2 — 创建比例尺**
```js
x = d3.scaleLinear()
  .domain([0, max(所有 adMean+adStd 和 ncMean+ncStd) × 1.12])
  .range([MARGIN.left, width - MARGIN.right])
```
比例尺将丰度值映射到像素位置，留 12% 的上限空间。

**Step 3 — 网格线**
```js
g.append('g').call(
  d3.axisBottom(x).ticks(6).tickSize(-(全高)).tickFormat('')
)
```
用 x 轴刻度线垂直延伸，形成横向参考网格。颜色 `#e2e8f0`，虚线 `3,3`。

**Step 4 — X 轴**
```js
axisBottom(x).ticks(6).tickFormat(d3.format('.2s'))
```
`.2s` 格式化：使用 SI 前缀，保留 2 位有效数字（如 1.2M, 340K）。

**Step 5 — Y 轴标签（物种名称）**
```js
g.append('g').selectAll('text')
  .data(data)
  .join('text')
  .attr('y', (_, i) => MARGIN.top + i * groupH + groupH / 2 + 4)
  .attr('text-anchor', 'end')
  .text(d => d.species.length > 23 ? d.species.slice(0,22) + '…' : d.species)
```
物种名称超过 23 字符时截断并加省略号。

**Step 6 — AD 组条形**
```js
g.selectAll('.bar-ad')
  .data(data).join('rect')
  .attr('x', d => x(Math.min(d.adMean, d.ncMean, 0)))  // 始终从左边界开始
  .attr('width', d => Math.abs(x(d.adMean) - x(0)))     // 条形宽度
  .attr('y', (_, i) => MARGIN.top + i * groupH)         // 上半部分
  .attr('height', BAR_HEIGHT)                           // 18px
  .attr('fill', '#e74c3c')                              // 红色
```

**Step 7 — NC 组条形**（类似，y 偏移 `BAR_HEIGHT`，绿色 `#2ecc71`）

**Step 8 — 误差线**
```js
// AD 组误差线
g.selectAll('.err-ad')
  .data(data).join('line')
  .attr('x1', d => x(d.adMean + d.adStd))
  .attr('x2', d => x(Math.max(0, d.adMean - d.adStd)))
  .attr('y1/y2', (_, i) => MARGIN.top + i * groupH + BAR_HEIGHT/2)
```
误差线从 `mean - std` 画到 `mean + std`，位于条形中心。

**Step 9 — 图例**
在右上角绘制 12×12 色块 + "AD 组" / "NC 组" 文字。

### 关键 D3 模式说明

- **enter/update/exit 模式**：使用 `.join()` 方法自动处理数据绑定
- **比例尺**：`d3.scaleLinear()` 建立数据域到像素域的线性映射
- **坐标轴**：`d3.axisBottom(x)` 自动生成刻度线和标签

---

## 7. 门级组成对比图

**文件**: `frontend/src/components/Charts/PhylumChart.jsx`

### 功能概述

用 D3.js 绘制水平分组条形图，展示各门在 AD 组和 NC 组的**相对丰度占比**（0~1）。

### 数据格式

```js
// props.data (stackData)
[
  { phylum: "Firmicutes",     adRatio: 0.45, ncRatio: 0.52 },
  { phylum: "Bacteroidetes",  adRatio: 0.30, ncRatio: 0.25 },
  // ... Top 6 + "Other" = 7 条
]
```

### 与柱状图的区别

| 项目 | 柱状图 (BarChart) | 门级图 (PhylumChart) |
|------|-----------------|-------------------|
| X 轴 | 绝对值，变长 | 百分比 [0, 1]，`tickFormat('.0%')` |
| 数据含义 | 绝对丰度均值 | 相对占比 |
| 条形排列 | 每组 AD/NC 上下叠放 | 每组 AD/NC 上下叠放 |
| 值标签 | 无 | 占比 > 5% 时在条上显示 |

### 值标签渲染
```js
g.selectAll('.val-ad')
  .data(data).join('text')
  .attr('x', d => x(d.adRatio) + 4)
  .text(d => d.adRatio >= 0.05 ? (d.adRatio * 100).toFixed(1) + '%' : '')
```
只有占比 ≥ 5% 才显示文字（避免条形太短时文字溢出）。文字颜色白色 `#fff`，字号 11，加粗 600。

---

## 8. 丰度箱线图

**文件**: `frontend/src/components/Charts/BoxPlot.jsx`

### 功能概述

用 ECharts 绘制箱线图，展示选定物种在 AD 组和 NC 组的丰度分布（最小值、Q1、中位数、Q3、最大值）。

### 交互设计

- **物种选择器**：顶部有一排可点击的标签按钮，默认全不选时自动取 Top 5
- **多选支持**：可同时选中多个物种进行并排比较
- **动态高度**：`Math.max(320, activeSpecies.length × 55 + 100)`

### 物种列表生成

```js
const availableSpecies = speciesCols
  .map(col => {
    // 提取物种短名、计算总丰度
    const short = getLevel/parse 逻辑取最后一段名
    const total = samples.reduce(...)
    return { full: col, short, total }
  })
  .sort((a, b) => b.total - a.total)
  .slice(0, 30)  // 只提供 Top 30 供选择
```

### 箱线图统计量计算（`boxValues` 函数）

```js
function boxValues(sorted) {
  Q1 = percentile(sorted, 25)
  median = percentile(sorted, 50)
  Q3 = percentile(sorted, 75)
  IQR = Q3 - Q1
  lower  = max(min(sorted), Q1 - 1.5 × IQR)  // 下须线
  upper  = min(max(sorted), Q3 + 1.5 × IQR)  // 上须线
  return [lower, Q1, median, Q3, upper]
}
```

**百分位数计算（线性插值）**：
```js
function percentile(sorted, p) {
  idx = (p / 100) × (sorted.length - 1)
  lo = Math.floor(idx)
  hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] × (hi - idx) + sorted[hi] × (idx - lo)
}
```
这是 `n-1` 方法的线性插值百分位数，与 Python `numpy.percentile` 的 `linear` 模式一致。

### ECharts 箱线图配置

```js
series: [
  { name: 'AD', type: 'boxplot', data: adData,
    itemStyle: { color: '#e74c3c', borderColor: '#c0392b' } },
  { name: 'NC', type: 'boxplot', data: ncData,
    itemStyle: { color: '#2ecc71', borderColor: '#27ae60' } },
]
```

ECharts 的 `boxplot` 类型自动根据五数概括 `[min, Q1, median, Q3, max]` 绘制箱体和须线。

### Tooltip 格式化

显示完整的五数概括：上限、Q3、中位数（加粗）、Q1、下限。

---

## 9. 丰度热图

**文件**: `frontend/src/components/Charts/Heatmap.jsx`

### 功能概述

用 ECharts 绘制丰度热图，行和列均经过**层次聚类**重排序，揭示样本-物种的双向聚类结构。

### 数据预处理

**Step 1 — Top 30 物种筛选**
```js
const top30 = speciesCols
  .map(col => ({ col, total: samples.reduce((s, r) => s + parseFloat(r[col])||0, 0) }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 30)
```

**Step 2 — 构建原始矩阵**
```js
// rawMatrix[n 样本][m 物种]
rawMatrix[i][j] = parseFloat(samples[i][top30[j]]) || 0
```

**Step 3 — 行距离矩阵（样本间欧氏距离）**
```js
for i, j in 0..n:
  rowDist[i][j] = sqrt( Σₖ (rawMatrix[i][k] - rawMatrix[j][k])² )
```

**Step 4 — 列距离矩阵（物种间欧氏距离）**
```js
for i, j in 0..m:
  colDist[i][j] = sqrt( Σₖ (rawMatrix[k][i] - rawMatrix[k][j])² )
```

**Step 5 — 层次聚类排序**
```js
rowOrder = hierarchicalClusterOrder(rowDist)  // 样本排列顺序
colOrder = hierarchicalClusterOrder(colDist)  // 物种排列顺序
```

### 热图数据生成

对原始丰度值做 **log10 变换**以压缩动态范围：
```js
heatData.push([vj, vi, val > 0 ? Math.log10(val + 1) : 0])
// 格式: [列索引, 行索引, 变换后的值]
```

`+1` 是为了处理 0 值：`log10(0+1) = 0`。

### Y 轴标签策略

每 12 个样本显示一个标签，避免标签过于密集：
```js
yLabels = rowOrder.map((ri, i) => i % 12 === 0 ? samples[ri].Sample : '')
```

### Y 轴标签颜色

AD 组样本的标签显示为红色 (`#c0392b`)、NC 组为绿色 (`#27ae60`)，直观区分分组。

### 颜色映射（visualMap）

```
低值(0) → ['#fff7ec' → '#fee8c8' → '#fdd49e' → ... → '#7f0000'] → 高值(maxLog)
```
使用类似 ColorBrewer 的橙-红渐变色带，适合表示非负数据的热度等级。

---

## 10. 分类旭日图

**文件**: `frontend/src/components/Charts/SunburstChart.jsx`

### 功能概述

用 ECharts 旭日图展示物种分类学的层级结构：门 → 纲 → 属，每层扇区面积表示该分类单元的总丰度。

### 数据构建（`buildSunburstData`）

**Step 1 — 聚合到三层树结构**
```js
tree = {}
for col of speciesCols:
  phylum = getLevel(col, 'p') || 'Unclassified'
  cls    = getLevel(col, 'c') || 'Unclassified'
  genus  = getLevel(col, 'g') || 'Unclassified'
  total = Σᵢ parseFloat(samples[i][col]) || 0  // 该物种在所有样本中的总丰度

  tree[phylum][cls][genus] += total
```

**Step 2 — 限制扇区数量（避免图表过于拥挤）**
- **门层级**：只保留 Top 6 门，其余合并为 "Other"
- **纲层级**：每个门下只显示 Top 4 纲，其余合并为 "Other class"
- **属层级**：每个纲下只显示 Top 3 属，其余合并为 "Other genus"

**Step 3 — 颜色分配**
```js
// 8 色色板轮转分配给 Top 6 + Other
COLORS = ['#5b9bd5', '#6aaf6a', '#e8a94e', '#e06b6b',
          '#8b7ec8', '#5dadad', '#f59664', '#c4a882']

// 子层级颜色 = lighter(基础色, 亮度系数)
纲颜色 = lighter(门颜色, 0.25)    // 25% 变亮
属颜色 = lighter(门颜色, 0.52)    // 52% 变亮
Other  = lighter(门颜色, 0.42~0.68) // 进一步淡化，斜体
```

**`lighter(hex, t)` 函数**：将 hex 颜色与白色混合，t 值越大越接近白色。

### 三层扇区配置

```js
levels: [
  {},  // 第0层（中心）：默认样式
  { r0: '15%', r: '35%', label: { rotate: 'tangential' } },  // 门 层
  { r0: '35%', r: '70%', label: { align: 'right' } },        // 纲 层
  { r0: '70%', r: '72%', label: { position: 'outside' } },   // 属 层
]
```

- 门层标签沿切线方向旋转
- 纲层标签水平右对齐
- 属层标签在外侧，`minAngle: 3` 避免过密

### 交互控制

#### 缩放控制（自定义实现）
```
buttonStyle 的 + / − / ↺ 按钮控制 SVG 的 CSS transform
  scale 范围: 0.35 ~ 8
  zoomAt(scale, mx, my): 以鼠标位置为中心缩放
  ↺ 按钮: 重置缩放 + 重新挂载组件
```

#### 拖拽平移
```
pointerdown → 记录起点
pointermove → 计算位移 → 更新 translate
pointerup   → 结束拖拽
```
拖动阈值 `DRAG_THRESHOLD = 6px`，小于此值视为点击，不触发拖拽。

#### 滚轮缩放
```
wheel 事件 → deltaY < 0 放大 1.12 倍, 否则缩小
以鼠标在图表上的位置为中心点缩放
```

### Node Click 行为

`nodeClick: 'rootToNode'` — 点击扇区时钻取到该节点（以该节点为新根），面包屑自动显示层级路径。

---

## 11. PCA 散点图

**文件**: `frontend/src/components/Charts/PCAPlot.jsx`

### 功能概述

用 ECharts 绘制 PCA 降维后的二维散点图，包含 95% 置信椭圆、dataZoom 边缘密度预览和交互缩放。

### 11.1 数据获取

```js
const pcaResult = computePCA(samples, top50SpeciesCols)
// { points: [{x, y, label: 'AD'|'NC', sample}], variance: [pc1Var, pc2Var] }
```

只选用总丰度 Top 50 的物种做 PCA 降维。

### 11.2 置信椭圆计算（`buildEllipseSeries`）

#### 协方差矩阵计算
```
mx = Σ xᵢ / n                           // x 均值
cx = Σ (xᵢ - mx)² / (n-1)              // x 方差
cxy = Σ (xᵢ - mx)(yᵢ - my) / (n-1)     // xy 协方差

协方差矩阵: [[cx, cxy],
             [cxy, cy]]
```

#### 特征值分解（`eigen2x2`）
```js
trace = a + c
det = a×c - b×b
disc = sqrt(trace² - 4×det)

λ₁ = (trace + disc) / 2    // 第一特征值（椭圆长轴方向方差）
λ₂ = (trace - disc) / 2    // 第二特征值（椭圆短轴方向方差）

// 特征向量方向（椭圆旋转角度）
v = [λ₁ - c,  b]
```

#### 椭圆路径生成
```js
椭圆半长轴 = sqrt(λ₁ × 5.991)  // χ²(df=2, 95%置信)
椭圆半短轴 = sqrt(λ₂ × 5.991)

// 在极坐标下生成椭圆点，旋转 angle 角度
for t in [0, 2π]:
  x = a × cos(t)
  y = b × sin(t)
  [x', y'] = rotate(x, y, angle) + [mx, my]
```

**χ²(2, 0.95) = 5.991**：二维正态分布下，95% 的数据点落在 χ²=5.991 的等概率椭圆内。

### 11.3 坐标轴范围计算

```
allX = [ 所有散点的 x ] + [ 所有椭圆点的 x ]
allY = [ 所有散点的 y ] + [ 所有椭圆点的 y ]

xRange = max(allX) - min(allX) || 1
yRange = max(allY) - min(allY) || 1
xPad   = xRange × 0.08  // 8% 留白
xMin   = min(allX) - xPad
xMax   = max(allX) + xPad
```

**为什么椭圆坐标也纳入**：确保椭圆完全可见，不会被裁切到图表外。

### 11.4 双坐标轴设计

为了隔离椭圆数据对 dataZoom 密度预览的污染，使用了**双坐标轴体系**：

```
主坐标轴 (index 0):  绑定散点数据，显示刻度标签和网格线
隐藏坐标轴 (index 1): 绑定椭圆数据，与主坐标轴范围一致但不可见
```

| 元素 | 绑定的轴 | 作用 |
|------|---------|------|
| AD 散点 | xAxis[0], yAxis[0] | 数据点 |
| NC 散点 | xAxis[0], yAxis[0] | 数据点 |
| 椭圆线 | xAxis[1], yAxis[1] | 95% 置信区域 |

### 11.5 dataZoom 配置

```js
dataZoom: [
  { type: 'slider', xAxisIndex: [0,1], seriesIndex: [2,3], ... },  // 底部预览
  { type: 'slider', yAxisIndex: [0,1], seriesIndex: [2,3], ... },  // 右侧预览
  { type: 'inside', xAxisIndex: [0,1], ... },  // 鼠标滚轮缩放
  { type: 'inside', yAxisIndex: [0,1], ... },  // 鼠标滚轮缩放
]
```

**核心机制**：
- `xAxisIndex: [0,1]` / `yAxisIndex: [0,1]` — 同时控制两个坐标轴，缩放/拖动时主副轴同步变化，椭圆和散点保持位置一致
- `seriesIndex: [2,3]` — slider 预览区只展示散点数据（系列索引 2 和 3），排除椭圆数据（索引 0 和 1）
- `filterMode: 'none'` — 缩放通过修改坐标轴范围实现，不直接过滤数据点

### 11.6 散点系列配置

```js
{
  name: 'AD 组',
  type: 'scatter',
  data: adPts.map(p => [p.x, p.y, p.sample, 'AD']),
  //                      [ 0   1      2        3  ]
  symbolSize: 8,
  itemStyle: { color: '#e74c3c', opacity: 0.78 },
  emphasis: { scale: 1.4, itemStyle: { opacity: 1 } },
}
```

### 11.7 Tooltip 格式化

```js
formatter: params => {
  const [x, y, sample, group] = params.data
  return `样本: ${sample}, 分组: ${group}, PC1: ${x}, PC2: ${y}`
}
```

从 4 元素数组中解构：索引 0,1 是坐标值，索引 2 是样本名，索引 3 是分组标签。

---

## 附录：人工复现指南

### 环境要求
- React 18+
- `echarts` + `echarts-for-react`（ECharts 图表）
- `d3`（柱状图和门级图）
- `xlsx`（SheetJS，解析 xlsx 文件）

### 数据准备
准备一个 xlsx 文件，要求：
1. 第一列为 `Sample`（样本编号）
2. 第二列为 `Group`（分组，值为 "AD" 或 "NC"）
3. 其余列以 `k__` 开头，格式为 `k__界|p__门|c__纲|o__目|f__科|g__属|s__种`
4. 数值为整数或浮点数，表示该物种在该样本的丰度

### 执行顺序
1. 数据加载 → `useSpeciesData(filePath)`
2. 统计卡片 → `StatsCards` 接收 `stats`
3. 柱状图 → `BarChart` 接收 `barData`
4. 门级图 → `PhylumChart` 接收 `stackData`
5. 箱线图 → `BoxPlot` 接收 `samples` + `speciesCols`
6. 热图 → `Heatmap` 接收 `samples` + `speciesCols`
7. 旭日图 → `SunburstChart` 接收 `samples` + `speciesCols`
8. PCA 图 → `PCAPlot` 接收 `samples` + `speciesCols`

### 关键数值参数速查

| 参数 | 值 | 位置 |
|------|---|------|
| Top N 物种 | 20 | `computeTopSpecies(..., 20)` |
| Top PCA 物种 | 50 | `PCAPlot`: `slice(0, 50)` |
| Top 热图物种 | 30 | `Heatmap`: `slice(0, 30)` |
| Top 门数 | 6 | `computePhylumComposition`: `slice(0, 6)` |
| Top 纲数/门 | 4 | `SunburstChart`: `slice(0, 4)` |
| Top 属数/纲 | 3 | `SunburstChart`: `slice(0, 3)` |
| 置信椭圆 χ² | 5.991 | df=2, p=0.95 |
| 幂迭代次数 | 80 | `powerIteration(_, 80)` |
| 椭圆采样点 | 161 | `ellipsePath(..., 160)` |
| 轴留白比例 | 8% | `xPad = xRange × 0.08` |
| dataZoom 高度 | 22px | `height: 22` |
| 散点大小 | 8px | `symbolSize: 8` |
| 箱线图百分位插值 | n-1 线性 | `percentile()` |
