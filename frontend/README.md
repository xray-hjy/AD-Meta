# 前端开发导航

React 19 + Vite 6。运行要求 Node.js 22.12 或更新版本；依赖以 `package-lock.json` 为准。

浏览器回归使用 `npm run test:e2e`；先安装后端 `backend/.venv` 的开发依赖及 `npx playwright install chromium`。测试的 Python 路径、端口和独立临时数据在 `e2e/environment.js` 中维护，支持 Windows 与 Linux。

## 目录职责

```text
frontend/
├── src/
│   ├── app/                 路由、领域定义、图表注册和分析策略
│   ├── pages/
│   │   ├── home/            正式首页：内容、组件、hooks、motion、styles、截图
│   │   ├── abundance/       物种 / KO 丰度工作区入口
│   │   ├── analysis/        通用分析工作区入口
│   │   └── mag/             MAG 工作区、热图、研究面板及专用算法
│   ├── components/          跨页面共享的图表、布局、数据集和基础 UI
│   ├── hooks/               共享数据请求和交互状态
│   ├── api/                 请求封装和生成的接口类型
│   ├── utils/               共享纯函数与导出工具
│   ├── assets/brand/        共用品牌素材；logo-parts 保留分层原稿和展示稿
│   ├── styles/              应用全局 token、布局及分析工作区样式
│   └── test/                测试辅助；测试文件就近放在被测模块旁
├── e2e/                     浏览器端流程与可访问性用例
├── scripts/                 构建、契约核对和 E2E 准备工具
└── public/                  必须原路径访问的静态资源
```

## 找到修改入口

| 需求 | 入口 |
| --- | --- |
| 首页文案、图集和入口链接 | `src/pages/home/homeContent.js` |
| 首页布局、滚动动画、Logo、维护约定 | [首页维护说明](src/pages/home/README.md) |
| 路由 | `src/app/AppRouter.jsx` |
| 图表注册与领域能力 | `src/app/chartRegistry.js`、`analysisDomains.js` |
| MAG 专用页面和热图 | `src/pages/mag/` |
| 共享图表和视口控件 | `src/components/Charts/` |
| 数据契约与整体架构 | [系统架构](../docs/architecture.md)、[API 契约](../docs/reference/api.md) |

## 放置与依赖约定

- 单页面专用组件、动画和样式放在该页面目录；多个页面确实共用时再放进共享目录。
- 页面入口负责组合；文案配置、布局样式、数据请求和交互控制器分别维护。不要为了一个视觉调整把业务逻辑塞进样式或文案配置。
- 首页样式由 `pages/home/styles/index.css` 导入，全部限定在 `.admeta-home`；分析工作区的全局样式不承载首页规则。
- 首页截图使用本地 import，由 Vite 打包；`docs/development/`、`docs/previews/` 的 Demo 是历史设计参考，应用不依赖它们。
- 使用外部动画实例时，通过 hook 创建并清理；监听器、计时器、RAF、WAAPI 与 Swiper 均在退出时释放。
- 修改公共图表先确认各领域的数据语义，遵循项目的科研表述边界。

## 本地运行与验证

在本目录运行：

```sh
npm ci
npm run dev
npm test -- --maxWorkers=2
npm run lint
npm run typecheck
npm run build
```

`dev` 同时启动后端和前端，需要先完成[本地环境配置](../docs/guides/runbook.md)。只启动前端可用 `npm run start`；API 默认代理到 `127.0.0.1:8000`。构建预览使用 `npm run preview`。

Vitest 验证行为和资源清理，不证明真实布局或动画观感。页面交界、图集首尾、窄屏和减少动态效果还需要浏览器检查。
