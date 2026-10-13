# Logo 分层素材

用户于 2026-10-10 提供三个独立的 SVG 部件，用于替换旧的矩形裁切拼装方式。

| 文件 | 原始文件 | 内容 |
| --- | --- | --- |
| `originals/top.svg` | `顶部.svg` | 蓝色顶部 |
| `originals/core.svg` | `中间件.svg` | 中间连接线与节点 |
| `originals/bottom.svg` | `底部.svg` | 青色底部 |
| `top.svg`、`core.svg`、`bottom.svg` | 对应 originals | 统一展示画布的版本 |

原始来源：`C:/Users/xdcai/Desktop/DESKTOP/svg/logo/`。

`originals/` 保留用户交付内容。展示版本将共同的 `viewBox` 从 `0 0 1674 1680` 改为 `585 440 505 685`，去除画布周围空白；路径、渐变和各部件之间的位置没有更改。`core.svg` 还将 Illustrator 的样式类展开为 SVG 展示属性，供行内描线动画使用，避免 `.st0` 等样式影响其他 SVG。三个部件应放在同一个尺寸的画布上叠加，不要分别按各自外形裁剪，否则拼合时会错位。

首页通过 `HomeLogo.jsx` 使用这些部件，开场和点击重播时，从五个已确认方案中随机选择，且避免连续重复。动画配置在 `pages/home/motion/logoAnimations.js`，生命周期与取消在 `createIntroController.js`。导航中的静态 Logo 仍使用原完整文件。
