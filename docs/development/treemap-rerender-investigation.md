# 矩形树图鼠标交互导致重排闪烁 — 调查报告

**日期:** 2026-06-09  
**涉及文件:** `frontend/src/components/Charts/SunburstChart.jsx`  
**依赖版本:** echarts ^6.0.0, echarts-for-react ^3.0.6

---

## 1. 现象描述

旭日图通过"切换"按钮转为矩形树图（treemap）后，鼠标在矩形树图**右侧区域**进行 hover 交互时，图表会出现短暂的重新排布（所有矩形块位置瞬间重排），随即立刻恢复原状。视觉上表现为一次明显的闪烁/跳动。

---

## 2. 根因分析

### 直接原因：`transitionEnabled` 状态回弹触发 `setOption` 导致 treemap 重排

切换按钮的 `onClick` 逻辑（第 179-181 行）：

```js
onClick={() => {
  setTransitionEnabled(true);   // ← 开启 universalTransition
  setViewMode(mode => ...);     // ← 切换视图模式
}}
```

切换后，`transitionEnabled` 被设为 `true`，1120ms 后由 `useEffect`（第 48-56 行）自动回弹为 `false`：

```js
useEffect(() => {
  if (!transitionEnabled) return undefined;
  const timer = window.setTimeout(() => {
    setTransitionEnabled(false);  // ← 1120ms 后回弹
  }, TRANSITION_DURATION_MS + 120);
  return () => window.clearTimeout(timer);
}, [transitionEnabled]);
```

关键问题在于 `option` 的 `useMemo` 依赖数组（第 169 行）包含 `transitionEnabled`：

```js
const option = useMemo(() => { ... }, [data, title, featureKind, viewMode, transitionEnabled]);
//                                                                      ^^^^^^^^^^^^^^^^^^^
```

**因此 `transitionEnabled` 回弹时，`useMemo` 重新计算，产生一个全新的 `option` 对象引用。**

`echarts-for-react` 在 `componentDidUpdate` 中通过 `fast-deep-equal` 做深比较来决定是否调用 `setOption`。虽然新旧 option 的**内容几乎完全相同**（仅 `universalTransition` 从 `true` 变为 `false`），但 `fast-deep-equal` 检测到差异后，会触发一次 `echartsInstance.setOption(option, { notMerge: false })`。

### 为什么 treemap 会重排而 sunburst 不明显？

ECharts 的 treemap 使用**矩形分割算法**（squarified layout）。当 `setOption` 被调用时，即使内容变化极小，ECharts 内部也会重新执行布局计算。treemap 的布局对数据顺序、渲染时机敏感，重新布局过程中矩形的位置会短暂偏移，然后在下一帧稳定。这在视觉上表现为"闪一下又恢复"。

sunburst 使用极坐标布局，重新计算时角度分布的变化不明显，因此同样的问题在 sunburst 模式下几乎不可见。

### 为什么鼠标在"右侧"交互时更明显？

treemap 配置了 `right: 18`（第 111 行），即图表区域右边距 18px。鼠标在右侧区域 hover 时：

1. **tooltip 触发**：ECharts 的 tooltip 使用 `trigger: 'item'`，hover 时需要命中检测和 DOM 更新
2. **tooltip `confine: true`**（第 75 行）：tooltip 被限制在图表容器内，右侧空间有限时需要重新定位
3. **tooltip `pointer-events: none`**（第 95 行）：虽然禁用了 tooltip 的指针事件防止闪烁，但 tooltip 的 DOM 更新仍可能影响布局

当鼠标在右侧边缘交互时，tooltip 的反复显示/隐藏/重定位与 treemap 的布局重算叠加，使闪烁更容易被观察到。

### 核心因果链

```
用户在 treemap 右侧 hover
        ↓
tooltip 显示/重定位（正常行为）
        ↓
（此时尚无异常，但此时如果 transitionEnabled 恰好回弹...）
        ↓
transitionEnabled: true → false（1120ms 定时器触发）
        ↓
useMemo 重新计算 option（仅 universalTransition 变化）
        ↓
echarts-for-react 检测到 option 引用变化
        ↓
调用 echartInstance.setOption(option, { notMerge: false })
        ↓
ECharts treemap 重新执行 squarified 布局算法
        ↓
矩形块位置短暂偏移 → 视觉闪烁 → 下一帧恢复
```

---

## 3. 验证方式

可通过以下方式验证此分析：

1. **延长切换后等待时间**：切换后等待超过 2 秒再 hover，此时 `transitionEnabled` 已回弹，不会闪烁。如果立刻 hover 则更容易触发。

2. **在 `useMemo` 依赖中移除 `transitionEnabled`**：仅保留 `[data, title, featureKind, viewMode]`，`universalTransition` 的变化不再触发 option 重新计算，闪烁应消失。

3. **将 `universalTransition` 改为始终 `false`**：不使用过渡动画，切换时不会有 morph 效果，但闪烁问题也会消失。

4. **在 ReactECharts 上添加 `notMerge={false}`（默认值）并观察**：确认 `setOption` 确实被调用（可在 ECharts 实例上监听 `rendered` 事件来验证）。

---

## 4. 涉及的代码路径总结

| 层级 | 文件/位置 | 角色 |
|------|-----------|------|
| 状态管理 | `SunburstChart.jsx:46` | `transitionEnabled` state |
| 定时回弹 | `SunburstChart.jsx:48-56` | useEffect 在 1120ms 后将 `transitionEnabled` 置为 `false` |
| Option 构建 | `SunburstChart.jsx:58-169` | useMemo 依赖包含 `transitionEnabled`，回弹时产生新 option 引用 |
| React 渲染 | `SunburstChart.jsx:201` | `<ReactECharts option={option} />` 传入新引用 |
| echarts-for-react | `node_modules/echarts-for-react/src/core.tsx:73-87` | `componentDidUpdate` 检测到 option 变化，调用 `setOption` |
| ECharts 引擎 | ECharts 内部 treemap 布局 | `setOption` 触发 squarified layout 重算，矩形位置短暂偏移 |

---

## 5. 结论

**根因是 `transitionEnabled` 的回弹机制设计问题**。该状态的本意是仅在切换动画期间启用 `universalTransition`，动画结束后关闭。但它被放入了 `useMemo` 的依赖数组，导致回弹时产生一次无意义的 `setOption` 调用，触发 treemap 布局重算和视觉闪烁。

这不是 ECharts 或 echarts-for-react 的 bug，而是 `useMemo` 依赖与短暂状态（ephemeral state）的交互方式导致的副作用。`transitionEnabled` 是一个"自毁型"状态（auto-resets），但它对 `useMemo` 的影响是持久的——每次回弹都会产生一个新 option 引用。
