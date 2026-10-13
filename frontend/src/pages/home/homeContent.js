// Homepage copy and screenshot metadata. No animation or scientific calculations here.
import speciesAbundance from './assets/species-species-native-bar-2026-10-07.png';
import phylumComposition from './assets/species-phylum-native-bar-2026-10-07.png';
import taxonomyHierarchy from './assets/home-analysis-preview.png';
import speciesTopN from './assets/species-species-topn.png';
import koAbundance from './assets/function-species-native-bar-2026-10-07.png';
import koContribution from './assets/function-koContribution-native-bar-2026-10-07.png';
import koContributionTopN from './assets/function-koContribution-topn.png';
import koTopN from './assets/function-species-topn.png';
import magBarLayout from './assets/mag-bar-layout-2026-10-07.png';
import magHeatmapGrouped from './assets/mag-heatmap-dendrogram-grouped.png';
import magHeatmapTransposed from './assets/mag-heatmap-dendrogram-transposed.png';
import magHeatmapExport from './assets/mag-heatmap-export-fitted.png';
import magBarRange from './assets/mag-bar-layout-range-2026-10-07.png';
import magExportSettings from './assets/mag-export-panel-2026-10-07.png';

export const HOME_CHAPTERS = [
  {
    key: "species",
    id: "home-species",
    label: "群落物种",
    overline: "01 / COMMUNITY TAXONOMY",
    title: [
      "从门到种，",
      "看菌群组成。"
    ],
    description: "用柱图比较 AD 与 NC 组的物种丰度，也可以切到分类层级图，从门、属一路看到种。只想看几个物种时，改一下显示数量即可。",
    features: [
      "AD / NC 丰度",
      "分类层级",
      "Top N 设置"
    ],
    action: "查看物种图表",
    route: "/analysis/abundance?dataset=ad-nc-species&chart=species",
    accent: "#2469db",
    entry: {
      title: "查看菌群组成",
      description: "比较两组丰度，按分类层级查看物种。",
      action: "查看物种图集"
    },
    slides: [
      {
        title: "物种丰度对比",
        image: speciesAbundance,
        width: 1862,
        height: 893,
        description: "比较 AD 与 NC 组的物种丰度"
      },
      {
        title: "门级组成",
        image: phylumComposition,
        width: 1862,
        height: 936,
        description: "在门级查看两组菌群组成"
      },
      {
        title: "分类层级图",
        image: taxonomyHierarchy,
        width: 2238,
        height: 1124,
        description: "按分类层级查看菌群组成"
      },
      {
        title: "物种显示数量",
        image: speciesTopN,
        width: 320,
        height: 549,
        description: "选择 Top N，或输入要显示的物种数"
      }
    ]
  },
  {
    key: "function",
    id: "home-function",
    label: "KO 功能",
    overline: "02 / COMMUNITY FUNCTION",
    title: [
      "比较 KO 丰度，",
      "查看相对贡献。"
    ],
    description: "按 KO 编号查看丰度，比较 AD 与 NC 两组。切到相对贡献视图，还能查看 KO 在样本内的占比。图表显示多少个 KO，可以从预设里选，也可以自己输入。",
    features: [
      "KO 丰度",
      "相对贡献",
      "显示数量"
    ],
    action: "查看 KO 图表",
    route: "/analysis/abundance?dataset=ad-nc-ko-abundance&chart=species",
    accent: "#0d8e93",
    entry: {
      title: "比较 KO 丰度",
      description: "查看 KO 丰度及样本内的相对贡献。",
      action: "查看 KO 图集"
    },
    slides: [
      {
        title: "KO 丰度对比",
        image: koAbundance,
        width: 1862,
        height: 893,
        description: "按 KO 编号比较两组丰度"
      },
      {
        title: "高丰度 KO 相对贡献",
        image: koContribution,
        width: 1862,
        height: 936,
        description: "查看样本内 KO 的相对贡献"
      },
      {
        title: "KO 显示数量",
        image: koContributionTopN,
        width: 320,
        height: 511,
        description: "选择预设数量，也可以自己输入"
      },
      {
        title: "KO 丰度显示设置",
        image: koTopN,
        width: 320,
        height: 549,
        description: "调整丰度图显示的 KO 数量"
      }
    ]
  },
  {
    key: "mag",
    id: "home-mag",
    label: "MAG 解析",
    overline: "03 / GENOME-RESOLVED",
    title: [
      "比较 MAG，",
      "柱图和热图都能用。"
    ],
    description: "用柱图比较 MAG 丰度，用热图查看各 MAG 在不同样本中的分布。样本和 MAG 都可以聚类，树枝、排列方向和显示数量可以分别调整。",
    features: [
      "样本热图",
      "样本 / MAG 聚类",
      "横纵轴交换"
    ],
    action: "查看 MAG 图表",
    route: "/analysis/mag",
    accent: "#a65277",
    entry: {
      title: "查看 MAG 热图",
      description: "比较 MAG 丰度，查看样本分布与聚类。",
      action: "查看 MAG 图集"
    },
    slides: [
      {
        title: "MAG 丰度对比",
        image: magBarLayout,
        width: 1862,
        height: 936,
        description: "比较 MAG 丰度，拖动查看不同区间"
      },
      {
        title: "MAG 样本丰度热图",
        image: magHeatmapGrouped,
        width: 2000,
        height: 1100,
        description: "查看样本与 MAG 的丰度矩阵及聚类树"
      },
      {
        title: "热图横纵轴交换",
        image: magHeatmapTransposed,
        width: 2000,
        height: 1100,
        description: "切换样本与 MAG 在横纵轴上的位置"
      },
      {
        title: "完整热图导出",
        image: magHeatmapExport,
        width: 1800,
        height: 1000,
        description: "把完整热图导出到指定尺寸的画布"
      }
    ]
  },
  {
    key: "custom",
    id: "home-customization",
    label: "自定义图表",
    overline: "04 / MAKE THE VIEW YOURS",
    title: [
      "图怎么画，",
      "你来定。"
    ],
    description: "换配色，调整柱宽和标签字号，或把热图的横纵轴交换一下。看完后可以导出 SVG 或 PNG，图像尺寸和 PNG 的像素倍率也能设置。",
    features: [
      "配色与字号",
      "缩放与浏览区间",
      "SVG / PNG 导出"
    ],
    action: "进入工作区调整图表",
    route: "/analysis/mag",
    accent: "#2469db",
    entry: null,
    slides: [
      {
        title: "柱图样式与方向",
        image: magBarLayout,
        width: 1862,
        height: 936,
        description: "调整柱图、折线与坐标方向"
      },
      {
        title: "连续导航与数值范围",
        image: magBarRange,
        width: 1862,
        height: 936,
        description: "缩放、平移，定位到要看的数据区间"
      },
      {
        title: "聚类树与配色",
        image: magHeatmapGrouped,
        width: 2000,
        height: 1100,
        description: "设置热图配色、排列与聚类树"
      },
      {
        title: "横纵轴交换",
        image: magHeatmapTransposed,
        width: 2000,
        height: 1100,
        description: "切换样本与 MAG 在横纵轴上的位置"
      },
      {
        title: "图像导出设置",
        image: magExportSettings,
        width: 1862,
        height: 936,
        description: "选择 SVG 或 PNG，设置图像尺寸"
      }
    ]
  }
];

export const HOME_COPY = {
  title: [
    "物种、KO、MAG，",
    "在一个工作区里查看。"
  ],
  lead: "微脑智库是面向阿尔茨海默病（AD）脑肠轴研究的肠道宏基因组分析工具。在浏览器里比较丰度、查看分类组成和样本热图，图表的配色、显示数量与导出尺寸都可以自己调整。",
  scrollCue: "向下滚动，看看图表怎么用 ↓",
  evidenceTitle: [
    "数据从哪里来，",
    "经过了哪些分析。"
  ],
  evidenceDescription: "数据来自公共肠道宏基因组研究，包含 AD 与健康对照样本。物种、KO 和 MAG 结果由上游分析流程生成，工作区使用这些结果进行查询和比较。",
  evidenceSteps: [
    [
      "公共宏基因组",
      "测序数据"
    ],
    [
      "质控、去宿主",
      "组装与注释"
    ],
    [
      "物种、KO 与 MAG",
      "分析结果"
    ],
    [
      "在工作区",
      "查询和比较"
    ]
  ],
  footnote: "AD 表示阿尔茨海默病组，NC 表示健康对照组。",
  ctaTitle: "打开工作区，看看数据。",
  ctaDescription: "选择物种、KO 或 MAG，查看完整图表、数据列表和处理方法。"
};
