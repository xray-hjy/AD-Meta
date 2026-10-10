# 首页维护说明

AD-Meta 的 `/` 路由直接渲染 `HomePage.jsx`。本目录是正式首页的唯一实现入口；`docs/development/homepage-layout-demo.html` 和 `docs/previews/homepage-motion-demo.html` 保留为设计参考，不参与应用运行或构建。

## 常用修改入口

| 要改什么 | 文件 | 注意事项 |
| --- | --- | --- |
| 标题、正文、功能列表、图集顺序、分析链接 | `homeContent.js` | `HOME_CHAPTERS` 对应物种、KO、MAG、自定义四组；`HOME_COPY` 对应首屏、数据来源和底部入口 |
| 截图 | `assets/` + `homeContent.js` | 使用本地 import；同时填写图片真实的 `width`、`height`，让横图和竖图保持各自比例 |
| 页框、颜色变量、通用按钮 | `styles/home-base.css` | 所有首页选择器以 `.admeta-home` 开头；不要修改全局 `body`、`html` 或分析工作区样式来调整首页 |
| 固定状态栏、浮动导航 | `styles/home-header.css` | 对应 `HomeHeader` |
| 首屏排版、领域 tabs | `styles/home-hero.css` | 对应 `HomeHero`；开场和跨区块运动分别由 intro、sections 样式负责 |
| 数据来源与底部入口 | `styles/home-foundation.css` | 对应 `HomeFoundation` |
| 图片预览弹窗 | `styles/home-dialog.css` | 对应 `GalleryDialog` |
| 展示区正文、上下文和间距 | `styles/home-showcase.css` | 对应 `HomeShowcase` / `ChapterCopy` |
| 图集外观与卡片 | `styles/home-gallery.css` | Swiper 负责卡片水平位移；图片尺寸由 `motion/galleryGeometry.js` 计算 |
| Logo 部件与五种动画 | `components/HomeLogo.jsx`、`motion/logoAnimations.js`、`src/assets/brand/logo-parts/` | 三个真实 SVG 共用画布；每次随机一种，避免连续重复 |
| 开场效果与取消 | `styles/home-intro.css`、`motion/createIntroController.js` | CSS keyframes 使用 `admeta-home-` 前缀，控制器负责开场、重播与清理 |
| 三个大区块的滚动衔接 | `styles/home-sections.css`、`motion/createSectionMotionController.js` | 参数在 `motionConfig.js` 的 `sections`；随原生滚动连续变化，反向滚动还原 |
| 滚轮灵敏度、过渡时间、透视、模块与上下文间距 | `motion/motionConfig.js` | 优先调整参数；更改桌面断点时也要同步 CSS 的响应式条件 |

## 目录与职责

```text
home/
├── HomePage.jsx                    页面组合、弹窗状态与首页跳转
├── homeContent.js                  展示内容与真实分析入口
├── components/
│   ├── HomeHeader.jsx              固定状态栏、浮动导航
│   ├── HomeHero.jsx                首屏与可键盘操作的领域 tabs
│   ├── HomeLogo.jsx                三个真实 SVG 部件与重播入口
│   ├── HomeShowcase.jsx            双栏展示区、图集控件、阅读区与滚动轨道
│   ├── ChapterCopy.jsx             正文及上下文共用的文字排版
│   ├── MobileGallery.jsx           窄屏、矮屏及减少动态效果模式的图集
│   ├── GalleryDialog.jsx           原生 dialog 图片预览
│   └── HomeFoundation.jsx          数据来源与底部入口
├── hooks/                         React 生命周期、媒体条件与进场观察
├── motion/
│   ├── motionConfig.js             展示区交互参数
│   ├── createShowcaseController.js 滚动轨道测量、章节选择与控制器组合
│   ├── createSectionMotionController.js 首屏、图集和数据区域之间的连续衔接
│   ├── createGalleryController.js  Swiper 创建、截图比例、模块图集缓存
│   ├── createWheelInput.js         滚轮输入策略与模块边界交接
│   ├── galleryGeometry.js          图集和滚动位置计算
│   ├── panelTransition.js          可取消的垂直淡入淡出
│   ├── createIntroController.js    可取消的首屏开场
│   └── logoAnimations.js           上下对合、弧线汇合、立体翻合、网络唤醒、轻弹扣合
├── styles/                        首页局部样式，index.css 为总入口
└── assets/                        Vite 打包的截图及来源说明
```

## 组件与动画的边界

React 管理导航、正文、上下文、按钮和弹窗。Swiper 14.3.0 使用 npm 的 core API，仅管理 `.stage-image-wrap` 这个空容器的子节点。不要在该容器里添加 React 子组件，也不要让 Swiper 克隆或修改右侧正文。

`useHomeShowcase` 在整个 React commit 完成后创建展示区控制器，避免读取尚未挂载的父容器 ref。控制器只查询传入的首页和展示区容器，展示图集通过回调报告选中项，滚轮策略不读取文案或业务数据。

控制器的 `dispose()` 清理监听器、计时器、动画帧、过渡动画及所有缓存的 Swiper 实例。React StrictMode 的重复挂载、路由离开和媒体条件切换都走同一个清理入口。不要添加没有对应清理的全局监听，也不要修改 `document.documentElement` 的状态来控制首页。

Logo 使用 `HomeLogo` 中的三个真实部件。`logoAnimations.js` 只定义五种运动轨迹与随机选择；`createIntroController.js` 管理开场和重播，每次排除上一次方案。网络唤醒直接动画 SVG 的线和节点，结束、中断或离开时取消所有填充效果，恢复原始素材。减少动态效果模式显示静态拼合 Logo。

`useHomeSectionMotion` 单独管理三个大区块之间的衔接，不接管滚轮。首屏淡出、图集从居中展开，右侧正文待图集接近归位后出现；末尾图集轻缩退场，数据内容上移淡入。只变换内部展示层，保持 `.story-layout`、`.evidence` 的布局坐标稳定。减少动态效果时关闭这些过渡。

`sections.duration` 控制 CSS 对滚动目标状态的缓动（默认 620ms），避免普通滚轮一步跨过中间帧。`heroTravel` 单独控制首屏退场，让文字尚在视窗内时就开始；`entryTravel` 控制图集展开距离。不要只设置位移/透明度而去掉 transition，否则滚轮会表现为跳状态。

## 滚动行为

- 宽度至少 1024px、高度至少 650px，且用户未选择减少动态效果时，启用桌面双栏画廊。
- 一次普通滚轮输入切一张；大幅或连续输入可以连翻。细触控板输入由 Swiper 移动，停止后吸附到完整图片。
- 到本组首张或末张后，再向外滚动交给相邻章节。末张动画尚未完成时只保留一次边界意图，反向输入取消它。
- 点击章节入口直接定位章节；拖动页面滚动条、PageDown 等原生滚动仍按轨道位置选中模块。
- 图集按模块缓存实例。重访模块时复用；离开首页时全部销毁。
- 双栏阅读区与滚动轨道共享 grid 区域，使用同一 sticky 顶部和高度。禁止用负 margin 模拟轨道重叠；否则末尾正文可能盖住数据来源区。
- 上下文复用完整正文结构，仅在独立容器上淡化并裁切，且 `inert` / `aria-hidden`；不要再给上下文内部叠加进场透明度。
- 窄屏、矮屏或减少动态效果模式恢复普通文档流，每个模块有独立按钮图集，不捕获滚轮。

## 分析入口与内容边界

首页不请求分析数据，也不执行统计计算。截图展示已存在的工作区能力；真实数据、图表可用性和结果解释仍由分析模块管理。

- 物种：`/analysis/abundance?dataset=ad-nc-species&chart=species`
- KO：`/analysis/abundance?dataset=ad-nc-ko-abundance&chart=species`
- MAG：`/analysis/mag`，由现有路由转入 MAG 领域
- 自定义入口：进入现有工作区调整图表，不假装直接打开某个设置弹窗

文案遵守根目录 `AGENTS.md` 的项目边界：面向 AD 脑肠轴研究的研发辅助工具。不要把候选特征写成临床诊断、已验证生物标志物或因果结论；不要仅凭计划书将未完成能力写为已上线。

## 验证

在 `frontend/` 使用 Node 22 或更新版本：

```sh
npx vitest run src/pages/home
npx eslint src/pages/home e2e/app.spec.js
npm run typecheck
npm run build
```

`HomePage.test.jsx` 覆盖实际分析链接、tab 键盘操作、移动图集、图片预览、StrictMode 以及媒体条件切换后的清理。`motion/createShowcaseController.test.js` 使用实际 Swiper，覆盖滚轮灵敏度、完整图片吸附、正反向边界、原生滚动、实例复用与退出清理。jsdom 不渲染真实布局和 CSS 动画；截图比例、过渡观感与末尾图层还需在浏览器检查。

`motion/createIntroController.test.js` 覆盖五种 Logo 方案可达且不连续重复、重播与退出取消、完成后恢复 SVG、减少动态效果。

`motion/createSectionMotionController.test.js` 覆盖首屏初始完整显示、两个边界的连续进度、反向还原、普通布局与退出清理。

浏览器建议检查：首屏开场 → 每组图集首尾 → 反向滚动 → 最后一组退出到数据来源 → 进入分析页再返回首页 → 窄屏及减少动态效果。`e2e/app.spec.js` 的首页用例也已对齐新入口。
