# 首页截图

这些 PNG 是已确认 Demo 使用的工作区截图，不是实时分析结果。

早期截图来自 `docs/previews/` 中的同名文件；`home-analysis-preview.png` 来自 `frontend/public/assets/`。保留名称便于核对。`custom-*-2026-10-22.png` 为当前本地工作区的实际界面截图。

统一维护入口为 `../homeContent.js`：`HOME_SCREENSHOTS` 保存文件、真实宽高与 alt；`HOME_HERO_BACKDROP` 选择首屏滚动背景截图；`HOME_CHAPTERS[].slides` 选择各组图集截图并保存标题和图注。桌面、移动端及放大预览共用同一份素材配置。

更换图片时同时更新目录中的 width/height 和 alt，复用位置会同步取得新素材。由 Vite 处理资源路径和内容哈希，不依赖 docs 目录或本机绝对路径。

## 自定义图集（2026-10-22）

共八张，统一在 `HOME_CHAPTERS` 的 `custom.slides` 选取、排序。图表截图裁取完整图表卡片，保留工具栏、样本口径与导航；热图同时保留选行设置和样本注释图例。

| 文件 | 实际范围与展示内容 |
| --- | --- |
| `custom-species-navigation-2026-10-22.png` | 全部 185 个样本（AD 122 / NC 63），Top 500 / 1828 物种；柱图局部缩放、浏览区间及分组纹理 |
| `custom-ko-line-2026-10-22.png` | 同一完整样本范围，Top 500 / 9537 KO；折线、数值标签和区间导航 |
| `custom-palette-collection-2026-10-22.png` | 四个真实配色菜单截图的并排排版：MAG 质量图的科研双色、分类图的多类别色板、热图的连续色带和 Z-score 发散色带；仅组合界面截图，不改写菜单选项 |
| `custom-mag-line-2026-10-22.png` | 全部 185 个样本、全部 872 个 MAG；折线、缩放平移和全局预览 |
| `custom-mag-heatmap-abundance-2026-10-22.png` | 全部 185 个样本 × 872 个 MAG；log10(1 + 丰度%)、Viridis、两轴聚类、横纵轴交换及年龄/性别等样本注释 |
| `custom-mag-heatmap-zscore-2026-10-22.png` | 相同完整矩阵；按 MAG 标准化的 Z-score、PuOr 发散色带、两轴聚类和样本注释 |
| `custom-species-style-settings-2026-10-22.png` | 全部样本、Top 500 物种；展开柱宽、小数位、标签字号、数值轴缩放、图例与动画设置 |
| `custom-ko-export-2026-10-22.png` | 全部样本、Top 500 KO；SVG / PNG、自定义 1800 × 1000 画布与 2× PNG 像素倍率设置 |

物种和 KO 使用默认正式分析运行 `ad-nc-community-diting-2026-10-16`，MAG 使用 PRJCA022804 队列。柱图/折线的缩放区间仅改变当前可见条目，Top 500 或全部 MAG 的选取范围仍完整保留。全部操作使用独立浏览器上下文，不覆盖用户浏览器的设置。
