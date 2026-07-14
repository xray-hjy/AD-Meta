# AD-Meta 系统架构

## 总体结构

```text
公开测序数据
    ↓ 独立生信流程（不在本仓库）
物种丰度表 / KO 丰度表
    ↓ backend/app/cli
数据校验与标准化
    ↓ backend/app/compute
统计结果与图表 projection 预计算
    ↓ MySQL + JSON cache
FastAPI 只读接口
    ↓
React 页面骨架 + ECharts 可视化
```

## 后端职责

```text
backend/app/
├── api/          HTTP 路由与公开接口
├── cli/          数据导入和存储重建命令
├── compute/      表格标准化、统计计算和图表预计算
│   └── charts/   按分析领域拆分的图表 payload
├── core/         配置与数据库基础设施
└── services/     数据集查询、导入与缓存读取
```

分类层级图使用一份 canonical taxonomy hierarchy。旭日图、矩形树图和放射树图读取统一树；桑基图使用由统一树派生的 `taxonomy_sankey` projection。projection 是面向某种可视化的数据表达，不是第二套科学数据源。

## 前端职责

```text
frontend/src/
├── api/          后端接口封装
├── app/          路由、图表注册表和应用组合
├── components/
│   ├── Charts/   图表及共享视口组件
│   ├── dataset/  数据集选择、摘要和图表导航
│   ├── layout/   顶栏、侧栏和工作区
│   └── ui/       通用状态与基础 UI
├── hooks/        数据请求、活动图表和视口测量
├── pages/        首页与分析工作区页面
└── styles/       token、基础样式、布局和组件样式
```

`ChartFrame` 负责页面级标题、说明、加载、错误和空状态。图表组件只负责图表内部控件与渲染，禁止再次包裹同类卡片或重复标题。

## 数据流

1. 导入命令读取宽表并识别 taxonomy 或 KO 数据集。
2. 后端写入数据集元数据和标准化长表。
3. `compute/precompute.py` 调度各领域计算模块生成缓存。
4. `chart_artifacts` 记录缓存类型、版本和位置。
5. FastAPI 只读取已发布数据集和预计算缓存。
6. React hooks 获取数据，`chartRegistry` 决定导航、组件和数据键。
7. 图表组件把 payload 映射为 ECharts option，不重复执行重型统计计算。

## 扩展约定

新增可视化时：

1. 先判断是否可由现有领域数据派生；同一科学数据不得复制成多套来源。
2. 重型统计、聚类、降维和大规模层级转换放在后端预计算。
3. 为专用图表 payload 使用明确的数据键，并在 API 文档中定义契约。
4. 在 `chartRegistry` 注册页面元数据和可用数据集类型。
5. 图表复用 `ChartFrame`、共享视口策略和设计 token。
6. 同步增加后端回归测试、前端组件测试和跨尺寸视觉验证。

新增 MAG 分析板块时，应建立独立领域模块和数据库契约，与当前物种/KO 丰度模块并列，不应把 MAG 字段塞入现有 taxonomy payload。
