// 首页文案与展示截图的统一维护入口；动画参数仍由 motionConfig.js 管理。
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
import customSpeciesNavigation from './assets/custom-species-navigation-2026-10-22.png';
import customSpeciesStyleSettings from './assets/custom-species-style-settings-2026-10-22.png';
import customKoLine from './assets/custom-ko-line-2026-10-22.png';
import customKoExport from './assets/custom-ko-export-2026-10-22.png';
import customMagLine from './assets/custom-mag-line-2026-10-22.png';
import customMagHeatmapAbundance from './assets/custom-mag-heatmap-abundance-2026-10-22.png';
import customMagHeatmapZscore from './assets/custom-mag-heatmap-zscore-2026-10-22.png';
import customPaletteCollection from './assets/custom-palette-collection-2026-10-22.png';

// 统一截图目录：文件、真实宽高和图片说明只在这里定义一次。
// 同一截图可以被不同章节复用，各章节保留自己的标题和图注。
export const HOME_SCREENSHOTS = {
  speciesAbundance: { image: speciesAbundance, width: 1862, height: 893, alt: 'AD 与 NC 组物种丰度柱状图分析界面' },
  phylumComposition: { image: phylumComposition, width: 1862, height: 936, alt: '门水平菌群组成分析界面' },
  taxonomyHierarchy: { image: taxonomyHierarchy, width: 2238, height: 1124, alt: '菌群分类层级图分析界面' },
  speciesTopN: { image: speciesTopN, width: 320, height: 549, alt: '物种显示数量设置界面' },
  koAbundance: { image: koAbundance, width: 1862, height: 893, alt: 'AD 与 NC 组 KO 丰度柱状图分析界面' },
  koContribution: { image: koContribution, width: 1862, height: 936, alt: '高丰度 KO 相对贡献分析界面' },
  koContributionTopN: { image: koContributionTopN, width: 320, height: 511, alt: 'KO 相对贡献显示数量设置界面' },
  koTopN: { image: koTopN, width: 320, height: 549, alt: 'KO 丰度显示数量设置界面' },
  magBarLayout: { image: magBarLayout, width: 1862, height: 936, alt: 'MAG 丰度柱状图及样式设置界面' },
  magHeatmapGrouped: { image: magHeatmapGrouped, width: 2000, height: 1100, alt: 'MAG 样本丰度热图与聚类树分析界面' },
  magHeatmapTransposed: { image: magHeatmapTransposed, width: 2000, height: 1100, alt: '交换横纵轴后的 MAG 样本丰度热图' },
  magHeatmapExport: { image: magHeatmapExport, width: 1800, height: 1000, alt: 'MAG 完整热图导出示例' },
  magBarRange: { image: magBarRange, width: 1862, height: 936, alt: 'MAG 丰度图缩放与浏览区间设置界面' },
  magExportSettings: { image: magExportSettings, width: 1862, height: 936, alt: 'MAG 图表 SVG 与 PNG 导出设置界面' },
  customSpeciesNavigation: { image: customSpeciesNavigation, width: 1862, height: 893, alt: '全部 185 个样本、Top 500 物种的柱图缩放与浏览区间设置' },
  customSpeciesStyleSettings: { image: customSpeciesStyleSettings, width: 1862, height: 893, alt: '物种柱图的柱宽、小数位、标签字号、图例与动画设置' },
  customKoLine: { image: customKoLine, width: 1862, height: 893, alt: '全部 185 个样本、Top 500 KO 的折线图与区间导航' },
  customKoExport: { image: customKoExport, width: 1862, height: 893, alt: 'KO 图表的 SVG、PNG、自定义画布尺寸与像素倍率导出设置' },
  customMagLine: { image: customMagLine, width: 1862, height: 931, alt: '全部 185 个样本、872 个 MAG 的折线图与全局预览导航' },
  customMagHeatmapAbundance: { image: customMagHeatmapAbundance, width: 1900, height: 1182, alt: '全部 185 个样本与 872 个 MAG 的 Viridis 丰度热图、聚类树和样本注释' },
  customMagHeatmapZscore: { image: customMagHeatmapZscore, width: 1900, height: 1182, alt: '全部 185 个样本与 872 个 MAG 的 PuOr 标准化热图、聚类树和样本注释' },
  customPaletteCollection: { image: customPaletteCollection, width: 1600, height: 850, alt: '科研双色、多类别色板、连续热图色带和发散热图色带四种真实配色选择栏' },
};

// 首屏滚动背景使用的截图序列；可独立增删、调序，不受图集顺序影响。
export const HOME_HERO_BACKDROP = [
  HOME_SCREENSHOTS.speciesAbundance,
  HOME_SCREENSHOTS.phylumComposition,
  HOME_SCREENSHOTS.taxonomyHierarchy,
  HOME_SCREENSHOTS.koAbundance,
  HOME_SCREENSHOTS.koContribution,
  HOME_SCREENSHOTS.magBarLayout,
  HOME_SCREENSHOTS.magHeatmapGrouped,
  HOME_SCREENSHOTS.magHeatmapTransposed,
  HOME_SCREENSHOTS.magHeatmapExport,
];

// 四组展示内容；slides 的顺序同时控制桌面图集、移动图集和放大预览。
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
    description: "用柱图比较 AD 与 NC 组的物种丰度，按分类层级浏览菌群组成。可调整显示数量，聚焦想查看的物种。",
    features: [
      "AD / NC 丰度",
      "分类层级",
      "Top N 设置"
    ],
    action: "查看物种图表",
    route: "/analysis/abundance?dataset=ad-nc-species&chart=species",
    accent: "#2469db",
    entry: {
      title: "比较菌群组成，定位关注物种",
      description: "比较 AD 与健康对照（NC）组的物种丰度，按分类层级浏览菌群组成。调整显示数量，从整体组成聚焦到关注的物种。",
      action: "查看物种图集"
    },
    slides: [
      {
        title: "物种丰度对比",
        ...HOME_SCREENSHOTS.speciesAbundance,
        description: "比较 AD 与 NC 组的物种丰度"
      },
      {
        title: "门级组成",
        ...HOME_SCREENSHOTS.phylumComposition,
        description: "在门级查看两组菌群组成"
      },
      {
        title: "分类层级图",
        ...HOME_SCREENSHOTS.taxonomyHierarchy,
        description: "按分类层级查看菌群组成"
      },
      {
        title: "物种显示数量",
        ...HOME_SCREENSHOTS.speciesTopN,
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
    description: "按 KO 编号比较 AD 与 NC 组的群落功能丰度，也可以查看样本内的相对贡献。图表显示数量支持选择预设值或自定义。",
    features: [
      "KO 丰度",
      "相对贡献",
      "显示数量"
    ],
    action: "查看 KO 图表",
    route: "/analysis/abundance?dataset=ad-nc-ko-abundance&chart=species",
    accent: "#0d8e93",
    entry: {
      title: "比较功能丰度，查看 KO 相对贡献",
      description: "按 KO 编号比较 AD 与 NC 组的群落功能丰度，再查看各 KO 在样本内的相对贡献，从两个角度观察功能组成。",
      action: "查看 KO 图集"
    },
    slides: [
      {
        title: "KO 丰度对比",
        ...HOME_SCREENSHOTS.koAbundance,
        description: "按 KO 编号比较两组丰度"
      },
      {
        title: "高丰度 KO 相对贡献",
        ...HOME_SCREENSHOTS.koContribution,
        description: "查看样本内 KO 的相对贡献"
      },
      {
        title: "KO 显示数量",
        ...HOME_SCREENSHOTS.koContributionTopN,
        description: "选择预设数量，也可以自己输入"
      },
      {
        title: "KO 丰度显示设置",
        ...HOME_SCREENSHOTS.koTopN,
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
      "从丰度到功能，",
      "深入解析 MAG。"
    ],
    description: "比较 AD 与 NC 组的 MAG 丰度，查看单个 MAG 的样本分布。结合分类、质量、系统发育与功能注释，了解基因组特征，并追溯代表 MAG 的来源与去冗余关系。",
    features: [
      "丰度与组间比较",
      "分类与功能注释",
      "质量与来源追溯"
    ],
    action: "进入 MAG 工作区",
    route: "/analysis/mag",
    accent: "#a65277",
    entry: {
      title: "查看 MAG 分布，联查基因组特征",
      description: "比较代表性 MAG 在 AD 与 NC 组的丰度，通过热图与聚类观察样本分布；结合分类、质量与功能注释，进一步了解关注的 MAG。",
      action: "查看 MAG 图集"
    },
    slides: [
      {
        title: "MAG 丰度对比",
        ...HOME_SCREENSHOTS.magBarLayout,
        description: "比较 MAG 丰度，拖动查看不同区间"
      },
      {
        title: "MAG 样本丰度热图",
        ...HOME_SCREENSHOTS.magHeatmapGrouped,
        description: "查看样本与 MAG 的丰度矩阵及聚类树"
      },
      {
        title: "热图横纵轴交换",
        ...HOME_SCREENSHOTS.magHeatmapTransposed,
        description: "切换样本与 MAG 在横纵轴上的位置"
      },
      {
        title: "完整热图导出",
        ...HOME_SCREENSHOTS.magHeatmapExport,
        description: "将完整热图导出为指定尺寸的图像"
      }
    ]
  },
  {
    key: "custom",
    id: "home-customization",
    label: "自定义图表",
    overline: "04 / MAKE THE VIEW YOURS",
    title: [
      "图表怎么呈现，",
      "由你调整。"
    ],
    description: "在物种、KO 和 MAG 图表中，按图表类型调整配色、图形、坐标方向、标签与图例。缩放平移浏览细节，设置热图聚类树和样本注释；导出时可选择 SVG 或 PNG，并设置图像尺寸与像素倍率。",
    features: [
      "图形、配色与标注",
      "缩放、布局与注释",
      "SVG / PNG 导出"
    ],
    action: "进入工作区调整图表",
    route: "/analysis/abundance?dataset=ad-nc-species&chart=species",
    accent: "#2469db",
    entry: null,
    slides: [
      {
        title: "物种柱图与区间浏览",
        ...HOME_SCREENSHOTS.customSpeciesNavigation,
        description: "全部样本 · Top 500 物种，缩放浏览关注区间"
      },
      {
        title: "KO 柱图与折线切换",
        ...HOME_SCREENSHOTS.customKoLine,
        description: "全部样本 · Top 500 KO，切换图形并浏览丰度变化"
      },
      {
        title: "为不同图表选择配色",
        ...HOME_SCREENSHOTS.customPaletteCollection,
        description: "并排查看科研双色、多类别色板及连续、发散热图色带"
      },
      {
        title: "MAG 折线与全局导航",
        ...HOME_SCREENSHOTS.customMagLine,
        description: "全部样本与 872 个 MAG，结合全局预览缩放、平移"
      },
      {
        title: "丰度热图与样本注释",
        ...HOME_SCREENSHOTS.customMagHeatmapAbundance,
        description: "全部样本与全部 MAG，展示连续色带、聚类树和注释条"
      },
      {
        title: "标准化热图与发散配色",
        ...HOME_SCREENSHOTS.customMagHeatmapZscore,
        description: "按 MAG 标准化，结合发散色带查看样本间变化"
      },
      {
        title: "物种图表的细节设置",
        ...HOME_SCREENSHOTS.customSpeciesStyleSettings,
        description: "调整柱宽、小数位、标签字号、图例与动画"
      },
      {
        title: "KO 图表的导出设置",
        ...HOME_SCREENSHOTS.customKoExport,
        description: "选择 SVG 或 PNG，自定义画布尺寸和 PNG 像素倍率"
      }
    ]
  }
];

// 组件及图集控制器的文案，包括辅助标签；按页面区域集中维护。
// 动态文案用函数生成，让桌面、移动端及预览保持一致。
export const HOME_COPY = {
  brand: {
    name: '微脑智库',
    homeLabel: '微脑智库首页',
    replayLogo: '重播微脑智库 Logo 拼装动画',
    footerName: 'AD-Meta · 微脑智库',
    tagline: '面向 AD 脑肠轴研究的肠道菌群研发辅助工具',
  },
  header: {
    navigationLabel: '首页导航',
    showcase: '图表展示',
    foundation: '数据与方法',
    customization: '图表自定义',
    reference: '外部队列参考',
    analysis: '进入工作区',
  },
  hero: {
    title: ['物种、KO、MAG，', '在一个工作区里查看。'],
    lead: [
      '微脑智库是面向阿尔茨海默病（AD）脑肠轴研究的肠道菌群研发辅助工具。',
      '在同一工作区查询、比较物种、KO 与 MAG 分析结果，并交互查看图表与数据。',
    ],
    scrollCue: '向下浏览，了解图表与常用设置 ↓',
    entryLabel: '选择分析领域',
    tabsLabel: '分析领域',
  },
  showcase: {
    eyebrow: 'EXPLORE THE ANALYSIS',
    title: '物种、功能与 MAG，有哪些图表？',
    description: '下面展示工作区中的图表和常用设置。',
    stageLabel: '可视化立体画廊',
    chaptersLabel: '切换展示章节',
    chapterLabel: label => label + '展示',
    featuresLabel: label => label + '可视化能力',
  },
  gallery: {
    browseHint: '轻滚切换 · 连续浏览 · 支持回看',
    nextChapterHint: '本组已看完，继续滚动看下一组 ↓',
    endHint: '本组已看完，继续向下浏览 ↓',
    previewTitle: '图表预览',
    close: '关闭 ✕',
    previous: '上一张图',
    next: '下一张图',
    label: label => label + '图集',
    open: title => '放大查看' + title,
    switchTo: title => '切换到' + title,
    previousIn: label => '上一张' + label + '图',
    nextIn: label => '下一张' + label + '图',
    count: (current, total, padded = false) => {
      const format = value => padded ? String(value).padStart(2, '0') : String(value);
      return format(current) + ' / ' + format(total);
    },
  },
  foundation: {
    eyebrow: 'DATA FOUNDATION',
    title: ['从公开数据，', '到可追溯的结果。'],
    description: '基于公开 AD 与健康对照队列，整合物种组成、群落功能与 MAG 等多层级分析结果。结合分析脚本、运行参数和来源记录，说明数据如何处理、结果如何形成，并在工作区中查询和比较。',
    cohortLabel: '当前展示队列',
    cohort: 'PRJCA022804 / CRA014435',
    groupSummary: 'AD 122 例 · 健康对照（NC）63 例',
    snapshot: { checkedAt: '2026-10-22', communityRun: 'ad-nc-community-diting-2026-10-16', magDataset: 'prjca022804-ad-nc' },
    snapshotLabel: date => '数据核对：' + date,
    metricsLabel: '当前队列的数据规模',
    metrics: [
      { key: 'samples', value: '185', label: '队列样本', note: '统一样本身份', domain: 'species' },
      { key: 'species', value: '1,828', label: '物种特征', note: '群落物种组成', domain: 'species' },
      { key: 'ko', value: '9,537', label: '标准 KO', note: '群落功能结果', domain: 'function' },
      { key: 'mag', value: '872', label: '代表 MAG', note: '质量筛选与去冗余后', domain: 'mag' },
    ],
    scopeNote: '统计对应当前队列完整结果；物种特征与代表 MAG 分别计数。',
    pipelineLabel: '数据到结果的分析路径',
    pipeline: [
      { title: '公开数据', description: '测序与样本信息' },
      { title: '质控与组装', description: 'Clean Reads · Contigs' },
      { title: '多层级解析', description: '物种 · 群落功能 · MAG' },
      { title: '查询与比较', description: '结果 · 图表 · 来源记录' },
    ],
    branchesLabel: '选择分析分支，查阅处理依据',
    branchHint: '选择一个分析分支，查看输入、处理方法与结果产物。',
    inspect: '查阅分析依据',
    collapseInspect: '收起分析依据',
    toggleLabel: label => label + '：查阅分析依据',
    detailLabel: label => label + '的分析依据',
    detailFields: { input: '输入数据', steps: '处理方法', output: '结果产物' },
    methodNote: '方法说明依据归档脚本；数量和运行参数以对应结果及运行记录为准。',
    sourceLink: '在工作区查阅方法与来源',
    branches: [
      {
        key: 'species', label: '群落物种', title: '从分类到丰度，查看菌群组成。',
        summary: '按分类层级组织物种信息，形成样本与物种对应的丰度结果。',
        result: '1,828 个物种特征',
        input: '质控与去宿主后的 Clean Reads，以及按 CRR 编号对应的样本信息。',
        steps: [
          { title: '物种分类与定量', tools: ['MetaPhlAn 4'], description: '获取各样本的群落分类组成和物种相对丰度。' },
          { title: '结果整理与样本关联', tools: ['分类与丰度表整理'], description: '保留种级特征，按样本编号关联 AD / NC 分组，组织为统一丰度矩阵。' },
        ],
        output: '物种分类信息与样本 × 物种丰度矩阵，用于分类浏览、组间比较和样本分布查看。',
      },
      {
        key: 'function', label: '群落功能', title: '从 KO 到通路，查看群落功能。',
        summary: '组织 KO 丰度及通路、功能指标，支持组间比较与样本分布查看。',
        result: '9,537 个 KO · 95 项通路与功能指标',
        input: '同一批样本的 Clean Reads 与组装产物，沿用统一样本身份和疾病分组。',
        steps: [
          { title: '群落功能分析', tools: ['DiTing'], description: '结合组装产物开展群落功能分析，生成 KO 丰度及通路、功能指标。' },
          { title: '功能结果组织', tools: ['KO 与通路结果整理'], description: '分别保留 KO 和通路指标的原始尺度，按样本编号组织用于查询与比较的结果。' },
        ],
        output: '样本 × KO 丰度矩阵与通路、功能指标；群落整体功能与 MAG 级功能注释分别组织。',
      },
      {
        key: 'mag', label: 'MAG 解析', title: '从基因组重建，到多角度解析。',
        summary: '关联丰度、分类、质量、系统发育与功能结果，追溯代表 MAG 的成员来源。',
        result: '872 个代表 MAG · 多维结果关联',
        input: '同一批样本的 Clean Reads、组装 Contigs 与分箱所需的回贴及覆盖信息。',
        steps: [
          { title: '组装与回贴', tools: ['MEGAHIT', 'Bowtie2'], description: '按样本组装，并生成分箱使用的比对和覆盖信息。' },
          { title: '分箱与整合', tools: ['MetaBAT2', 'SemiBin2', 'MetaDecoder', 'MAGScoT'], description: '结合多种分箱结果与标记基因证据，形成整合后的 bins。' },
          { title: '质量评估与去冗余', tools: ['CheckM2', 'dRep'], description: '评估完整度和污染度，经质量筛选与去冗余形成代表 MAG 目录。' },
          { title: '丰度、分类与系统发育', tools: ['CoverM', 'GTDB-Tk', 'IQ-TREE'], description: '定量样本丰度，关联分类注释和系统发育树，补充基因组关系。' },
          { title: '功能解析与来源关联', tools: ['DRAMMA', 'antiSMASH'], description: '组织 ARG 与生物合成基因簇结果，并关联代表 MAG 的成员关系和来源记录。' },
        ],
        output: '样本丰度、分类、质量、系统发育、ARG / BGC 及来源关系，通过 MAG ID 关联查询。',
      },
    ],
    reference: {
      label: '外部队列参考',
      description: '结合 GMrepo 扩增子队列，查看菌属分布、身份核查与探索性比较结果。',
      action: '查看外部队列参考', route: '/reference/gmrepo',
    },
  },
  cta: {
    eyebrow: 'START EXPLORING',
    title: '选择分析领域，开始查看结果。',
    description: '从菌群组成、群落功能或 MAG 特征入手，查看结果并查阅分析依据。',
    navigationLabel: '选择分析工作区',
    actions: [
      { key: 'species', label: '查看物种结果' },
      { key: 'function', label: '查看 KO 结果' },
      { key: 'mag', label: '查看 MAG 结果' },
    ],
  },
  symbols: { forward: '→', external: '↗', previous: '‹', next: '›' },
};
