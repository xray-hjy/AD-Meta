# 首页维护说明

AD-Meta 的 `/` 路由直接渲染 `HomePage.jsx`。本目录是正式首页的唯一实现入口；`docs/development/homepage-layout-demo.html` 和 `docs/previews/homepage-motion-demo.html` 保留为设计参考，不参与应用运行或构建。

## 常用修改入口

| 要改什么 | 文件 | 注意事项 |
| --- | --- | --- |
| 标题、正文、功能列表、图集顺序、分析链接 | `homeContent.js` | `HOME_CHAPTERS` 对应物种、KO、MAG、自定义四组；`HOME_COPY` 对应首屏、数据来源和底部入口 |
| 截图 | `assets/` + `homeContent.js` | 使用本地 import；同时填写图片真实的 `width`、`height`，让横图和竖图保持各自比例 |
| 页框、颜色变量、通用按钮 | `styles/home-base.css` | 所有首页选择器以 `.admeta-home` 开头；不要修改全局 `body`、`html` 或分析工作区样式来调整首页 |
| 通栏固定顶部导航 | `styles/home-header.css` | 对应 `HomeHeader`；高度与正文、锚点偏移共享变量 |
| 首屏排版、领域 tabs | `styles/home-hero.css` | 对应 `HomeHero`；开场和跨区块运动分别由 intro、sections 样式负责 |
| 首屏截图背景 | `components/HomeHeroBackdrop.jsx`、`styles/home-hero-backdrop.css` | 复用本地横版截图；倾斜、列数、透视、周期、速度倍率和视差幅度在 `motionConfig.js` 的 `heroBackdrop` 调整 |
| 数据来源与底部入口 | `styles/home-foundation.css` | 对应 `HomeFoundation` |
| 图片预览弹窗 | `styles/home-dialog.css` | 对应 `GalleryDialog` |
| 展示区正文、上下文和间距 | `styles/home-showcase.css` | 对应 `HomeShowcase` / `ChapterCopy` |
| 图集外观与卡片 | `styles/home-gallery.css` | Swiper 负责卡片水平位移；图片尺寸由 `motion/galleryGeometry.js` 计算 |
| Logo 部件与五种动画 | `components/HomeLogo.jsx`、`motion/logoAnimations.js`、`src/assets/brand/logo-parts/` | 三个真实 SVG 共用画布；每次随机一种，避免连续重复 |
| 开场效果与取消 | `styles/home-intro.css`、`motion/createIntroController.js` | CSS keyframes 使用 `admeta-home-` 前缀，控制器负责开场、重播与清理 |
| 区块注册、吸附与扩展 | `components/HomeSection.jsx`、`motion/createSectionRegistry.js`、`motion/createSectionSnapController.js` | 按 DOM 顺序注册；`snap` 参数管理吸附距离、等待时间和时长 |
| 区块的滚动衔接 | `motion/sectionMotionPresets.js`、`motion/createSectionMotionController.js` | 每块声明自己的视觉配方；控制器不依赖固定区块数量或名称 |
| 滚轮灵敏度、过渡时间、透视、模块与上下文间距 | `motion/motionConfig.js` | 优先调整参数；更改桌面断点时也要同步 CSS 的响应式条件 |

## 目录与职责

```text
home/
├── HomePage.jsx                    页面组合、弹窗状态与首页跳转
├── homeContent.js                  展示内容与真实分析入口
├── components/
│   ├── HomeHeader.jsx              通栏固定顶部导航
│   ├── HomeSection.jsx             普通文档流区块与生命周期注册
│   ├── HomeSectionContext.js       首页局部注册表上下文
│   ├── HomeHero.jsx                首屏与可键盘操作的领域 tabs
│   ├── HomeHeroBackdrop.jsx        本地截图倾斜背景；与前景交互分离
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
│   ├── createSectionRegistry.js    DOM 顺序、增删与重排通知
│   ├── createSectionSnapController.js 原生滚动停止后的柔和吸附及取消
│   ├── sectionGeometry.js          区块边界测量与吸附目标选择
│   ├── sectionMotionPresets.js     各区域的展示层进出配方
│   ├── createHeroBackdropController.js 小幅鼠标视差、离屏/后台暂停与清理
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

首屏下方的背景延伸量由 `home-hero-backdrop.css` 中 `--hero-backdrop-extension` 控制：同时增加首屏底部空间和背景平面高度，让图表展示区在正常文档流中相应下移，不通过负 margin 或背景溢出来覆盖展示区。图墙使用三份连续序列，每轮位移一份序列，保证加高后循环边缘始终有图片覆盖。

鼠标视差由 `createHeroBackdropController.js` 在目标变化时启动短暂 rAF 跟随，收敛后停止；`heroBackdrop.response` 控制跟随响应（毫秒）。尺寸在滚动/缩放/ResizeObserver 通知后重新测量，逐帧只写背景平面的 transform。不要在每次鼠标移动时修改图墙根层的继承变量，或重新叠加 CSS transform transition；图片也不单独添加 filter 合成层。

React 管理导航、正文、上下文、按钮和弹窗。Swiper 14.3.0 使用 npm 的 core API，仅管理 `.stage-image-wrap` 这个空容器的子节点。不要在该容器里添加 React 子组件，也不要让 Swiper 克隆或修改右侧正文。

`useHomeShowcase` 在整个 React commit 完成后创建展示区控制器，避免读取尚未挂载的父容器 ref。控制器只查询传入的首页和展示区容器，展示图集通过回调报告选中项，滚轮策略不读取文案或业务数据。

控制器的 `dispose()` 清理监听器、计时器、动画帧、过渡动画及所有缓存的 Swiper 实例。React StrictMode 的重复挂载、路由离开和媒体条件切换都走同一个清理入口。不要添加没有对应清理的全局监听，也不要修改 `document.documentElement` 的状态来控制首页。

Logo 使用 `HomeLogo` 中的三个真实部件。`logoAnimations.js` 只定义五种运动轨迹与随机选择；`createIntroController.js` 管理开场和重播，每次排除上一次方案。网络唤醒直接动画 SVG 的线和节点，结束、中断或离开时取消所有填充效果，恢复原始素材。减少动态效果模式显示静态拼合 Logo。

`useHomeSectionMotion` 按注册顺序管理区块衔接，不接管滚轮。`sectionMotionPresets.js` 保存首屏、图集和通用淡入配方；新增区块可以选择通用配方或提供自己的工厂函数。只变换内部展示层，保持 `HomeSection` 和布局锚点的坐标稳定。减少动态效果时关闭这些过渡。

动态进度只更新首屏内容、背景、图集、阅读层和数据内容这些展示层的 transform/opacity，数值未变时跳过写入；首页根节点只保留静态配置，避免局部滚动动画使导航和所有截图反复重算继承样式。过渡时间仍由 `home-sections.css` 与 `sections.duration` 管理。

`sections.duration` 控制 CSS 对滚动目标状态的缓动（默认 620ms），避免普通滚轮一步跨过中间帧。`heroTravel` 单独控制首屏退场，让文字尚在视窗内时就开始；`entryTravel` 控制图集展开距离。不要只设置位移/透明度而去掉 transition，否则滚轮会表现为跳状态。

## 滚动行为

`useHomeSectionSnap` 观察原生页面滚动，停止 180ms 后，只在区块边界附近进行 480ms 的快起慢停吸附；不阻止滚轮、不创建嵌套页面滚动容器。窄屏降低吸附范围；长内容允许自由浏览，仅入口及长区域的末尾提供停留位置。键盘滚动、编辑控件及嵌套滚动容器不触发此次自动吸附。用户再次滚动、拖动、窗口或内容尺寸变化会取消旧定位；预览弹窗打开时暂停，减少动态效果模式只保留即时导航。

桌面图集通过适配器提供 `getStops(): {start, end} | null` 与 `isBusy(): boolean`。两端为绝对文档滚动坐标；首端是第一组首张，末端是最后一组末张。该范围内外层完全暂停自动吸附。向前进入吸附到首端，反向进入吸附到末端；图集动画或输入仍在处理时也不吸附。图集恢复普通布局时返回空值，外层按实际长内容处理。章节按钮跳转使用协调器的 `navigate(action)`，避免程序定位被自动吸附改写。

## 新增区域

在 `HomePage` 的现有 `HomeSectionContext.Provider` 内加入组件即可；顺序按实际 DOM 计算，条件渲染、移除和直接兄弟重排都会使几何缓存失效。唯一 `id` 不使用数组索引。

```jsx
<HomeSection id="research-cases" size="viewport" motion={revealSectionMotion}>
  <section aria-labelledby="research-cases-title">
    <div data-section-surface>
      <h2 id="research-cases-title">研究案例</h2>
      {/* 此处渲染区域内容 */}
    </div>
  </section>
</HomeSection>
```

- `size="viewport"`：最小高度为导航以下的可用视口，内容超出时自然撑高；默认 `content` 由内容决定高度。
- `snap="start"`：默认普通区域；`none` 关闭该区域的自动停留点；`managed` 配合适配器用于复杂内部浏览。
- `anchor(element)`：可选的内部稳定布局锚点；普通区域默认使用外壳。
- `motion(element, page, pinned)`：可选工厂，返回读取进度并生成 `{element, styles}` 数组的函数；控制器批量写入并在卸载时清理。工厂放在模块作用域，保持引用稳定。
- `goto(id)`：统一区域导航；`navigate(action)`：协调已有章节或程序跳转。

不要在新增区域中再监听全局滚轮，或动画 `HomeSection` 外壳本身。新增导航项指向稳定区域 ID，通过现有 `onSection` 调用协调器即可。

## 图集内部滚动

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

`createSectionRegistry.test.js`、`sectionGeometry.test.js`、`createSectionSnapController.test.js` 覆盖任意区块数量、直接兄弟重排、长内容、图集范围保护、反向进入、输入取消、程序导航、尺寸变化和卸载清理。截图加载本身不取消导航；由 ResizeObserver 判断真实尺寸变化，缺少该能力时才以 load 事件回退。

浏览器建议检查：首屏开场 → 每组图集首尾 → 反向滚动 → 最后一组退出到数据来源 → 进入分析页再返回首页 → 窄屏及减少动态效果。`e2e/app.spec.js` 的首页用例也已对齐新入口。
