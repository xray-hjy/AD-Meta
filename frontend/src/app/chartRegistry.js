import { lazy } from 'react';
import { getAnalysisDataForFeatureKind } from './analysisDomains';

const BarChart = lazy(() => import('../components/Charts/BarChart'));
const PhylumChart = lazy(() => import('../components/Charts/PhylumChart'));
const BoxPlot = lazy(() => import('../components/Charts/BoxPlot'));
const Heatmap = lazy(() => import('../components/Charts/Heatmap'));
const DetectionHeatmap = lazy(() => import('../components/Charts/DetectionHeatmap'));
const KoLdaBarChart = lazy(() => import('../components/Charts/KoLdaBarChart'));
const TaxonomyChart = lazy(() => import('../components/Charts/TaxonomyChart'));
const PCAPlot = lazy(() => import('../components/Charts/PCAPlot'));
const PCoAPlot = lazy(() => import('../components/Charts/PCoAPlot'));

const TAXONOMY_GROUP = {
  key: 'taxonomyHierarchy',
  label: '分类层级图',
  subtitle: '旭日图、矩形树图、桑基图、放射树图',
};

function resolvedFeatureLabel(context) {
  return context.featureLabel || (context.featureKind === 'ko' ? 'KO' : '物种');
}

function resolvedFeatureCount(context) {
  return context.chartData?.featureCount
    || context.chartData?.speciesCount
    || context.summary?.totalFeatures
    || context.summary?.totalSpecies
    || 0;
}

function resolvedAnalysisDataLabel(context) {
  return getAnalysisDataForFeatureKind(context.featureKind).label;
}

export const CHART_REGISTRY = {
  species: {
    navLabel: '丰度对比',
    navSubtitle: ({ featureLabel }) => `Top N ${featureLabel} AD vs NC`,
    title: ({ featureLabel }) => `Top N ${featureLabel}丰度对比`,
    subtitle: ({ featureLabel }) => `展示 AD / NC 组均值；横轴为${featureLabel}标签，可调整 Top N`,
    availableFor: ['taxonomy', 'ko'],
    component: BarChart,
    layout: 'compact',
  },
  phylum: {
    navLabel: ({ featureKind }) => (featureKind === 'ko' ? 'KO 功能组成' : '门级组成'),
    navSubtitle: ({ featureKind }) => (featureKind === 'ko' ? 'Top KO 相对丰度占比' : '各门相对丰度占比'),
    title: ({ featureKind }) => (featureKind === 'ko' ? 'KO 功能组成概览' : '门级组成概览'),
    subtitle: ({ featureKind }) => (featureKind === 'ko' ? '基于 AD/NC 平均丰度占比，展示 Top KO 功能项' : '基于 AD/NC 平均丰度占比，按门水平汇总'),
    availableFor: ['taxonomy', 'ko'],
    component: PhylumChart,
    layout: 'fit',
  },
  boxplot: {
    navLabel: '丰度箱线图',
    navSubtitle: ({ featureLabel }) => `${featureLabel}分布与离散程度`,
    title: '丰度箱线图',
    subtitle: ({ featureLabel }) => `比较目标${featureLabel}在 AD / NC 组内的分布、四分位数和离群点`,
    availableFor: ['taxonomy'],
    component: BoxPlot,
    layout: 'fit',
  },
  heatmap: {
    navLabel: '差异热图',
    navSubtitle: ({ featureLabel }) => `差异${featureLabel}聚类分析`,
    title: '差异丰度热图',
    subtitle: ({ featureLabel }) => `Mann-Whitney U、BH-FDR q<0.05 且 |log2FC|>1 的差异${featureLabel}；包含 AD、NC、合并聚类与差异视图`,
    availableFor: ['taxonomy'],
    component: Heatmap,
    layout: 'document',
  },
  detection: {
    navLabel: 'KO 检出率热图',
    navSubtitle: 'AD/NC 检出率与检出样本数',
    title: 'KO 检出率热图',
    subtitle: '丰度 > 0 视为检出；单元格数字为检出样本数，颜色表示检出率',
    availableFor: ['ko'],
    component: DetectionHeatmap,
    layout: 'fit',
  },
  differential_ko: {
    navLabel: 'KO 差异特征',
    navSubtitle: 'FDR 校正后的 KO 组间效应',
    title: 'KO 差异特征效应图',
    subtitle: '探索性 Mann-Whitney U + BH-FDR；rank-biserial 效应量，NC 富集向左，AD 富集向右',
    availableFor: ['ko'],
    component: KoLdaBarChart,
    dataKey: 'differential_ko',
    layout: 'fit',
  },
  sunburst: {
    group: TAXONOMY_GROUP,
    navLabel: '旭日图',
    navSubtitle: '环形层级占比',
    title: '分类层级旭日图',
    subtitle: context => `${resolvedAnalysisDataLabel(context)}；门、纲、属、物种层级占比`,
    availableFor: ['taxonomy'],
    component: TaxonomyChart,
    dataKey: 'taxonomy',
    mode: 'sunburst',
    layout: 'special',
  },
  treemap: {
    group: TAXONOMY_GROUP,
    navLabel: '矩形树图',
    navSubtitle: '矩形面积层级占比',
    title: '分类层级矩形树图',
    subtitle: context => `${resolvedAnalysisDataLabel(context)}；用面积呈现门、纲、属、物种层级占比`,
    availableFor: ['taxonomy'],
    component: TaxonomyChart,
    dataKey: 'taxonomy',
    mode: 'treemap',
    layout: 'special',
  },
  sankey: {
    group: TAXONOMY_GROUP,
    navLabel: '桑基图',
    navSubtitle: '层级流向与占比',
    title: '分类层级桑基图',
    subtitle: context => `${resolvedAnalysisDataLabel(context)}；门、纲、属、物种层级流向与丰度权重；低丰度分类已合并为 Other`,
    availableFor: ['taxonomy'],
    component: TaxonomyChart,
    dataKey: 'taxonomy_sankey',
    mode: 'sankey',
    layout: 'special',
  },
  radialtree: {
    group: TAXONOMY_GROUP,
    navLabel: '放射树图',
    navSubtitle: '层级关系与分支结构',
    title: '分类层级放射树图',
    subtitle: context => `${resolvedAnalysisDataLabel(context)}；展示门、纲、属、物种的放射状父子层级结构`,
    availableFor: ['taxonomy'],
    component: TaxonomyChart,
    dataKey: 'taxonomy',
    mode: 'radialtree',
    layout: 'special',
  },
  pca: {
    navLabel: 'PCA',
    navSubtitle: '样本聚类趋势',
    title: 'β多样性 PCA',
    subtitle: context => `Top ${resolvedFeatureCount(context)} ${resolvedFeatureLabel(context)}；后端预计算`,
    availableFor: ['taxonomy'],
    component: PCAPlot,
    layout: 'special',
  },
  pcoa: {
    navLabel: 'PCoA',
    navSubtitle: 'Bray-Curtis 距离主坐标分析',
    title: 'β多样性 PCoA',
    subtitle: context => {
      const permanova = context.chartData?.permanova;
      const base = `Bray-Curtis · Top ${resolvedFeatureCount(context)} ${resolvedFeatureLabel(context)}；后端预计算`;
      if (!permanova) return base;
      return `${base} · PERMANOVA R²=${Number(permanova.r2 || 0).toFixed(4)}, p=${Number(permanova.pValue || 1).toFixed(4)}`;
    },
    availableFor: ['taxonomy'],
    component: PCoAPlot,
    layout: 'special',
  },
};

function resolveChartText(value, context) {
  return typeof value === 'function' ? value(context) : value;
}

function chartContext({
  featureKind = 'taxonomy',
  featureLabel = '物种',
  summary = null,
  chartData = null,
} = {}) {
  return { featureKind, featureLabel, summary, chartData };
}

export function resolveChartMeta(chartType, contextInput = {}) {
  const chart = CHART_REGISTRY[chartType];
  if (!chart) return null;

  const context = chartContext(contextInput);
  return {
    ...chart,
    key: chartType,
    label: resolveChartText(chart.navLabel, context),
    subtitle: resolveChartText(chart.navSubtitle, context),
    title: resolveChartText(chart.title || chart.navLabel, context),
    frameSubtitle: resolveChartText(chart.subtitle || chart.navSubtitle, context),
  };
}

export function getAvailableCharts(featureKind = 'taxonomy', featureLabel = '物种', availableArtifacts) {
  const actualArtifacts = Array.isArray(availableArtifacts)
    ? new Set(availableArtifacts.map(key => (key === 'lda' ? 'differential_ko' : key)))
    : null;
  return Object.entries(CHART_REGISTRY)
    .filter(([key, chart]) => {
      if (!chart.availableFor.includes(featureKind)) return false;
      const requiredArtifact = chart.requiredArtifact || chart.dataKey || key;
      return actualArtifacts === null || actualArtifacts.has(requiredArtifact);
    })
    .map(([key]) => resolveChartMeta(key, { featureKind, featureLabel }));
}

export function getChartDefinition(chartType) {
  return CHART_REGISTRY[chartType] || null;
}
