# MAG 数据概览与流程

`MagDatasetDescription` 展示队列、样本范围和丰度口径；`MagProcessingFlow` 展示完整上下游关系。两者按 `dataFingerprint` 保持同一来源修订，切换样本筛选时保留流程选择，切换修订时重置局部交互状态。

## 内容和数据

- `magOverviewContent.js`：统一文案、节点输入/方法/产物、工具名称、拓扑关系、脚本角色和结果入口。`MAG_MAIN_STAGES` 定义紧凑主线，`MAG_BRANCH_STAGES` 定义右侧分支排列。
- `magProcessingProfiles.js`：将当前 provenance、modules 和 capabilities 转为展示模型。全量数量从 processing / samples 模块读取，当前范围从 scope provenance 读取；上游不具备一致统计时只显示方法，不反推数字。
- 代谢功能节点为中性方法位置，尚无绑定产物时不生成数量、状态、来源下载或结果按钮。后续为其接入模块与入口即可。
- 群落物种来自 Clean Reads；DiTing 来自 Clean Reads 和 contigs；CoverM 来自 Clean Reads 和代表 MAG；系统发育来自 GTDB 标记基因比对。群落 KO 与 MAG 功能分别组织。

## 交互和布局

`MagFlowGraph` 使用 HTML 按钮与 SVG 连线，构建主线与下游解析分为两条横向泳道，共用六列；工具名称常驻显示，群落分析单列为关联入口。ResizeObserver 跟随节点尺寸更新连线，字体加载后重新测量。连线使用画布像素坐标、圆角折线与固定尺寸箭头；代表 MAG 通过公共分支线连接下游，分类注释再连接系统发育，Clean Reads / contigs 的关联线从外侧绕行。较窄的页面可横向滚动。悬停/聚焦高亮相关路径，点击固定选中状态；节点本身不位移，避免箭头端点偏移。方向键与 Home/End 浏览节点，收起详情时恢复对应节点焦点。

`MagCollapse` 通过实际内容高度驱动过渡，内容切换和来源列表增加后同样调整高度；关闭时立即退出可访问树并设为 inert，保留内容完成收起动画。减少动态效果设置关闭过渡。

## 来源记录

`MagSourceEvidence` 首次展开时请求现有 `/api/mag/sources?revision=…`，两个模块共享按修订缓存的查询。每个步骤只展示相关结果模块与方法脚本；文件列表分批展开，下载索引保留原清单位置。

脚本由后端 methodology 模块随导入固定文件路径与 SHA-256。脚本是方法资料，运行参数和结果统计来自各自结果模块。下载使用已有 `/api/mag/sources/{module}/{index}`，后端验证原文件字节数与 SHA-256。JSON 来源记录携带当前筛选范围与完整修订来源清单，不在每次图表响应中重复下发大型文件列表。
