# 分类层级可视化开发与优化记录

## 1. 文档目的

本文记录 AD-Meta 分类层级板块的设计演进和实现依据，覆盖旭日图、矩形树图、桑基图与放射树图。它用于帮助后续开发者理解当前代码为什么这样组织，以及新增功能时哪些规则不能被破坏。

稳定的数据接口以 `docs/reference/api.md` 为准；本文属于开发记录，不替代 API 契约。

## 2. 统一数据基础

### 2.1 Canonical taxonomy hierarchy

四种可视化共享后端生成的统一分类层级树，层级为：

```text
phylum → class → genus → species
```

正式计算入口位于：

- `backend/app/compute/charts/taxonomy/hierarchy.py`
- `backend/app/compute/charts/taxonomy/pruning.py`
- `backend/app/compute/charts/taxonomy/projections.py`

`hierarchy.py` 从物种丰度表按全样本丰度求和，建立带 `name`、`rank`、`value`、`children` 的事实树。旭日图、矩形树图和放射树图直接使用该树；桑基图由该树生成 `taxonomy_sankey` projection。

这里的 projection 指同一份分类事实数据面向某种图表的结构化表达，不是第二套分类数据源。

### 2.2 长尾压缩

为了避免 9820 个物种全部进入层级图导致标签和节点失控，后端在每层按数量上限和父级占比压缩长尾：

| 层级 | 最多保留 | 最小父级占比 | 合并节点 |
|---|---:|---:|---|
| 门 | 24 | 0.1% | `Other phyla` |
| 纲 | 12 | 0.3% | `Other classes` |
| 属 | 12 | 0.4% | `Other genera` |
| 物种 | 4 | 0.8% | `Other species` |

每个合并节点保留真实总丰度、相对父级占比和 `mergedCount`。压缩只改变展示粒度，不改变被合并分支的丰度总量。

当前 `ad-nc-species` 缓存验证结果为：

- 分类树节点：801
- 叶节点：607
- 被合并的长尾分支：3814
- Sankey 节点：801
- Sankey 边：792

这些数字是当前数据集的结果，不是写死在程序里的目标值。

### 2.3 配色

分类树使用现有分类配色作为门级主色，同一门下的子节点通过向白色混合形成同色系层级。桑基图为了区分流向深度，使用独立的蓝、青绿、橙、紫、粉层级色板。

公共后端配色位于 `backend/app/compute/charts/taxonomy/colors.py`。前端不得为同一个门在不同分类图中随意生成不一致的主色。

## 3. 前端公共结构

### 3.1 单一图表组件

四种图统一由 `frontend/src/components/Charts/TaxonomyChart.jsx` 渲染，通过 `mode` 选择 ECharts series：

- `sunburst`
- `treemap`
- `sankey`
- `radialtree`

左侧导航和数据键由 `frontend/src/app/chartRegistry.js` 注册。分类层级子图不再各自维护卡片、标题或第二套数据请求。

### 3.2 卡片与画布尺寸契约

页面级卡片由 `ChartFrame` 提供，分类图内部使用：

- `TaxonomyViewport.jsx`：分类图公共可视区域。
- `useAvailableViewport.js`：通过 `ResizeObserver` 获取卡片实际宽度和浏览器可用高度。
- `taxonomyViewportPolicy.js`：集中定义各图最小/最大高度、宽高比和 Sankey 内边距。

尺寸计算以卡片内容盒为准，不使用“27 寸显示器”“笔记本”等物理设备名称写条件分支。屏幕或浏览器缩放变化后，代码显式调用 `chart.resize({ width, height })`，确保 ECharts 内部 renderer 与 React 容器保持一致。

这一步解决了外层容器已经变大、ECharts 内部画布仍停留在旧尺寸而导致图像被压扁的问题。

## 4. 旭日图

### 4.1 展示目标

旭日图用于同时观察门、纲、属、物种的嵌套占比。扇区角度代表丰度比例，颜色表示门级分支，向外一圈表示更细分类层级。

### 4.2 小门级处理

后端统一树中的门级节点保持事实结构。旭日图前端额外把占总丰度小于 1% 的门归入灰色 `Others`，仅用于旭日图总览：

- 总览只显示一个 `Others` 扇区，不直接展开其子扇区。
- 右侧门级列表保留 `Others` 的真实占比，并缩进显示 `Other phyla`、`Fusobacteria`、`Euryarchaeota` 等组成项及各自颜色。
- tooltip 说明合并名称和数量。
- 点击 `Others` 后进入明细层级，各子门恢复本身颜色。

### 4.3 下钻与返回

下钻继续使用 ECharts 原生 `nodeClick: 'rootToNode'` 和 `sunburstRootToNode` action。返回使用 ECharts 自动生成的中心灰色返回环，不另外叠加按钮或伪造返回节点。

`Others` 明细采用合法树结构作为新的 series data，并在图表 ready 后通过原生 action 定位到 `Others` 根节点，因此保留 ECharts 自带动画和逐级返回语义。

### 4.4 标签与半径

- 内层标签使用 radial 方向放置。
- 仅最外层标签放到圆外，避免所有层级文字同时占用外圈。
- 画布尺寸依据叶节点数量和最长标签长度计算。
- 外层标签安全边距计入图像完整边界，不能为了扩大圆形而让标签被卡片裁切。
- 当前视口策略在可读标签与主体半径之间动态取值，而不是固定百分比半径。

## 5. 矩形树图

### 5.1 展示目标

矩形树图用面积表达分类丰度，适合比较主要物种及长尾构成。顶层门级使用稳定主色，子节点在该主色基础上生成明度层次。

### 5.2 边界和小色块

白色边线根据色块的全局丰度占比和深度动态变细：色块越小，边线、透明度和间隙越小，避免边线覆盖填充色后看起来像白块。较大的父级保留更明显的分组边界。

### 5.3 自适应标签

ECharts 原生 treemap 标签在极小区域和 hover 状态下会主动隐藏或重新布局。当前实现关闭叶节点原生 label，并基于 ECharts 完成后的节点 layout 生成静态 `graphic` 文本：

- 普通矩形使用水平单行标签。
- 宽度小于 64px、且高度明显大于宽度的窄长矩形使用旋转 90° 的单行标签。
- 文本按实际可用长度截断，并用 `...` 表示省略。
- 只有厚度和长度确实不足时才隐藏标签。
- 足够大的色块同时显示名称和真实占比。
- 自定义文本使用 `silent: true`，不会拦截 tooltip 或 hover。

### 5.4 大屏比例与重排

矩形树图最大宽高比集中配置为 1.7，宽屏时根据卡片可用高度限制宽度并居中，避免在大显示器上被拉成细长横条。

由于仅更新 React style 时 ECharts renderer 可能仍保留旧尺寸，代码在容器稳定后显式读取 `clientWidth/clientHeight` 并调用 `chart.resize()`。标签 graphic 在 resize 完成后重新生成，避免文字位置沿用旧布局。

## 6. 桑基图

### 6.1 后端 projection

Sankey 的节点和边由后端预计算，前端优先读取 `/charts/taxonomy_sankey`，不再每次在浏览器重复遍历分类树。

节点 ID 使用完整层级路径而不是显示名称，避免不同父级下同名 `Other species`、`Other genera` 被错误合并。payload 同时提供：

- `maxDepth`
- `maxColumnCount`
- 推荐 `width`、`height`
- `nodeGap`

自然画布高度按最密集列计算：

```text
max(1180, maxColumnCount × 21 + 180)
```

当前数据的最密集列为 581 个节点，因此自然高度为 12381px。

### 6.2 宽度适配

画布宽度使用 CSS `clamp(最小可读宽度, 卡片内容宽度, 数据自然宽度)`：

- 常见笔记本宽度下优先收进卡片，不要求横向拖动才能理解完整层级。
- 当视口小于节点和标签的最低可读宽度时，才允许横向滚动。
- 左右内边距同时考虑首列、末列和标签宽度，不把固定空白误当作画布内容。

### 6.3 高度与滚动

Sankey 允许纵向滚动，但滚动容器必须先完整填满卡片。实际画布高度取“后端自然高度”和“卡片可视高度”的较大值：

- 数据较少时，图像至少占满卡片，不在卡片下方留下无效空白。
- 数据较多时，画布按节点密度增长，在卡片内部纵向滚动。
- 卡片、滚动容器、ECharts root 和 renderer 使用同一内容盒尺寸契约。

### 6.4 交互

- 节点不可拖拽，保持稳定分类结构。
- hover 使用 `focus: 'adjacency'`，突出相邻来源和去向。
- 连线继承 source 颜色，并使用曲线和半透明度减少视觉噪声。

## 7. 放射树图

### 7.1 展示目标

放射树图强调父子关系和分支结构，不以扇区面积表达丰度。前端只为统一树增加一个无标题根节点，然后使用 ECharts radial tree 布局。

### 7.2 节点与标签

- 节点使用空心圆，所有层级保持可见。
- 分支线采用浅色曲线，hover 聚焦后代节点。
- 初始展开深度为 3，与门、纲、属、物种四级结构协调。
- 圆形核心半径由叶节点数量估算。
- 外圈文字所需边距由最长标签估算，并同时写入 series 的 top/right/bottom/left。

标签被视为图表完整边界的一部分。画布不足时优先扩大可滚动图面，不能让外圈文字被容器裁掉，也不通过整体 CSS transform 缩放来伪造适配。

## 8. 缓存与兼容

正式缓存键：

- `taxonomy`：统一分类层级树。
- `taxonomy_sankey`：由统一树派生的 Sankey projection。

`sunburst`、`taxonomy_tree` 以及旧计算函数仍作为历史缓存或导入路径的兼容别名。新代码不得继续把 `sunburst` 当作整个分类层级领域的正式名称。

## 9. 验证要求

修改分类层级板块后至少检查：

1. 后端分类树节点值等于子节点值之和。
2. pruning 后总丰度保持不变，`mergedCount` 正确。
3. `taxonomy_sankey` 的 source/target 均能匹配节点 ID。
4. 旭日图 `Others` 下钻、原生返回环、动画和颜色正确。
5. 矩形树图水平/竖向标签、省略号和小色块边线正确。
6. Sankey 在笔记本宽度下无不必要横向滚动，在大屏下填满卡片并可纵向滚动。
7. 放射树图外圈节点、文字和树线不被裁切。
8. 至少使用笔记本和宽屏两类 viewport 做实际截图和 renderer 像素尺寸检查。

## 10. 后续维护原则

- 科学事实树只能由后端 canonical hierarchy 维护。
- 图表特有的结构转换放在 projection，不复制科学数据源。
- 数据规模压缩应记录规则、保留丰度总量并提供 tooltip 解释。
- 尺寸适配以卡片实际内容盒为依据，不按设备名称堆叠媒体查询。
- 不通过额外按钮、伪造节点或覆盖 ECharts 内部事件来模拟框架已经提供的交互。
- 新增分类层级可视化时，优先复用 `TaxonomyViewport`、统一配色和现有 API，而不是建立新的独立页面数据链。
