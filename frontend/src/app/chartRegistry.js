import { lazy } from 'react';
import { getAnalysisDataForFeatureKind } from './analysisDomains';

const BarChart = lazy(() => import('../components/Charts/BarChart'));
const PhylumChart = lazy(() => import('../components/Charts/PhylumChart'));
const KoContributionChart = lazy(() => import('../components/Charts/KoContributionChart'));
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

const ALL_SCOPES = ['cohort', 'group', 'subset', 'sample'];
const DISTRIBUTION_SCOPES = ['cohort', 'group', 'subset'];
const COMPARISON_SCOPES = ['cohort', 'subset'];

function rangeControl(label, defaultValue = 20, max = 500, purpose = 'display') {
  return { key: 'topN', label, defaultValue, min: 1, max, input: 'range', purpose };
}

function selectControl(key, label, defaultValue, options, purpose = 'analysis') {
  return {
    key,
    label,
    defaultValue,
    input: 'select',
    purpose,
    options: options.map(option => (
      option && typeof option === 'object'
        ? { value: option.value, label: option.label }
        : { value: option, label: String(option) }
    )),
  };
}

function topNPresetControl(label, defaultValue, options, purpose = 'display') {
  return selectControl('topN', label, defaultValue, options, purpose);
}

function analysisPolicy({
  scopes,
  controls = [],
  featureSelection = null,
  minSamples = 1,
  minPerGroup = 0,
  requirement = '',
  inference = null,
}) {
  return {
    scope: {
      allowed: scopes,
      minSamples,
      minPerGroup,
      requiredGroups: minPerGroup ? ['AD', 'NC'] : [],
      requirement,
    },
    controls,
    featureSelection,
    inference,
  };
}

function selectedValue(context, key, fallback) {
  if (key === 'topN') return context.topN ?? fallback;
  return context.parameters?.[key] ?? fallback;
}

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
    projection: 'abundance',
    analysisPolicy: analysisPolicy({
      scopes: ALL_SCOPES,
      controls: [rangeControl(({ featureLabel }) => `Top N ${featureLabel}`)],
    }),
  },
  phylum: {
    navLabel: '门级组成',
    navSubtitle: '各门相对丰度占比',
    title: '门级组成概览',
    subtitle: '基于 AD/NC 平均丰度占比，按门水平汇总',
    availableFor: ['taxonomy'],
    component: PhylumChart,
    layout: 'fit',
    projection: 'composition',
    analysisPolicy: analysisPolicy({
      scopes: ALL_SCOPES,
      controls: [rangeControl('显示组成项', 8, 50)],
    }),
  },
  koContribution: {
    navLabel: '高丰度 KO',
    navSubtitle: 'Top KO 相对贡献',
    title: '高丰度 KO 相对贡献',
    subtitle: '各样本先转换为矩阵内相对贡献，再计算组均值并按共享排名展示 Top N；未展示 KO 不合并为 Other',
    availableFor: ['ko'],
    component: KoContributionChart,
    layout: 'fit',
    projection: 'ko_contribution',
    availability: 'analysis_projection',
    analysisPolicy: analysisPolicy({
      scopes: ALL_SCOPES,
      controls: [topNPresetControl('展示 KO 数量', 20, [10, 20, 50, 100])],
    }),
  },
  boxplot: {
    navLabel: '丰度箱线图',
    navSubtitle: ({ featureLabel }) => `${featureLabel}分布与离散程度`,
    title: '丰度箱线图',
    subtitle: ({ featureLabel }) => `比较目标${featureLabel}在 AD / NC 组内的分布、四分位数和离群点`,
    availableFor: ['taxonomy'],
    component: BoxPlot,
    layout: 'fit',
    projection: 'boxplot',
    analysisPolicy: analysisPolicy({
      scopes: DISTRIBUTION_SCOPES,
      minSamples: 2,
      featureSelection: {
        defaultMode: 'ranked',
        ranking: 'mean_abundance',
        defaultLimit: 30,
        rankedLimits: [10, 20, 30, 50, 100, 200, 500],
        warningThreshold: 30,
        strongWarningThreshold: 100,
      },
      requirement: '至少 2 个样本；单组范围仅描述该组分布',
    }),
  },
  heatmap: {
    navLabel: '差异热图',
    navSubtitle: ({ featureLabel }) => `差异${featureLabel}聚类分析`,
    title: '差异丰度热图',
    subtitle: context => {
      const q = selectedValue(context, 'qValueMax', 0.05);
      const log2fc = selectedValue(context, 'log2FcMinAbs', 1);
      return `Mann-Whitney U、BH-FDR q<${q} 且 |log2FC|>${log2fc} 的差异${resolvedFeatureLabel(context)}；包含 AD、NC、合并聚类与差异视图`;
    },
    availableFor: ['taxonomy'],
    component: Heatmap,
    layout: 'document',
    projection: 'heatmap',
    analysisPolicy: analysisPolicy({
      scopes: COMPARISON_SCOPES,
      minSamples: 6,
      minPerGroup: 3,
      controls: [
        topNPresetControl(({ featureLabel }) => `差异${featureLabel}展示上限`, 50, [20, 50, 100, 200]),
        selectControl('qValueMax', 'FDR q 值上限', 0.05, [0.01, 0.05, 0.1]),
        selectControl('log2FcMinAbs', '|log2FC| 下限', 1, [0.5, 1, 1.5, 2]),
      ],
      requirement: '至少 3 个 AD 与 3 个 NC 样本',
      inference: { method: 'mann_whitney_bh_fdr', requiresComparison: true },
    }),
  },
  detection: {
    navLabel: 'KO 检出率热图',
    navSubtitle: 'AD/NC 检出率与检出样本数',
    title: 'KO 检出率热图',
    subtitle: '当前矩阵中丰度 > 0 视为检出；单元格数字为检出样本数，颜色表示检出率',
    availableFor: ['ko'],
    component: DetectionHeatmap,
    layout: 'fit',
    projection: 'detection',
    analysisPolicy: analysisPolicy({
      scopes: COMPARISON_SCOPES,
      minSamples: 6,
      minPerGroup: 3,
      controls: [topNPresetControl('KO 展示上限', 50, [20, 50, 100, 200])],
      requirement: '至少 3 个 AD 与 3 个 NC 样本',
    }),
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
    projection: 'differential_ko',
    analysisPolicy: analysisPolicy({
      scopes: COMPARISON_SCOPES,
      minSamples: 6,
      minPerGroup: 3,
      controls: [
        topNPresetControl('差异 KO 展示上限', 30, [10, 20, 30, 50, 100]),
        selectControl('qValueMax', 'FDR q 值上限', 0.05, [0.01, 0.05, 0.1]),
        selectControl('prevalenceMin', '最低检出比例', 0.1, [0, 0.05, 0.1, 0.2, 0.3]),
      ],
      requirement: '至少 3 个 AD 与 3 个 NC 样本',
      inference: { method: 'mann_whitney_bh_fdr_rank_biserial', requiresComparison: true },
    }),
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
    projection: 'taxonomy',
    analysisPolicy: analysisPolicy({ scopes: ALL_SCOPES }),
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
    projection: 'taxonomy',
    analysisPolicy: analysisPolicy({ scopes: ALL_SCOPES }),
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
    projection: 'taxonomy_sankey',
    analysisPolicy: analysisPolicy({ scopes: ALL_SCOPES }),
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
    projection: 'taxonomy',
    analysisPolicy: analysisPolicy({ scopes: ALL_SCOPES }),
  },
  pca: {
    navLabel: 'PCA',
    navSubtitle: '样本聚类趋势',
    title: '样本丰度结构 PCA',
    subtitle: context => {
      const featureLabel = resolvedFeatureLabel(context);
      return `按样本闭合后的平均相对丰度选取 ${resolvedFeatureCount(context) || selectedValue(context, 'topN', 50)} 个${featureLabel}，CLR 变换后进行 PCA`;
    },
    availableFor: ['taxonomy'],
    component: PCAPlot,
    layout: 'special',
    projection: 'pca',
    prefetchPolicy: 'on_navigation',
    analysisPolicy: analysisPolicy({
      scopes: DISTRIBUTION_SCOPES,
      minSamples: 3,
      controls: [topNPresetControl(({ featureLabel }) => `参与计算的${featureLabel}数`, 50, [50, 100, 200, 500], 'feature_selection')],
      requirement: '至少 3 个样本；按样本闭合后的平均相对丰度选取物种，零值替换并 CLR 变换',
      inference: { method: 'exploratory_ordination', ellipse: 'group_data_distribution_95' },
    }),
  },
  pcoa: {
    navLabel: 'PCoA',
    navSubtitle: 'Bray-Curtis 距离主坐标分析',
    title: 'β多样性 PCoA',
    subtitle: context => {
      const selection = context.chartData?.featureSelection;
      const selectedCount = selection?.selectedCount || resolvedFeatureCount(context);
      const sourceCount = selection?.sourceFeatureCount || context.summary?.totalFeatures || context.summary?.totalSpecies;
      const base = `样本内相对丰度 · Bray-Curtis · ${selectedCount || 0}/${sourceCount || 0} 个${resolvedFeatureLabel(context)}参与距离计算`;
      return `${base} · 组间检验与离散度结果见下方计算说明`;
    },
    availableFor: ['taxonomy'],
    component: PCoAPlot,
    layout: 'special',
    projection: 'pcoa',
    prefetchPolicy: 'on_navigation',
    analysisPolicy: analysisPolicy({
      scopes: DISTRIBUTION_SCOPES,
      minSamples: 3,
      controls: [selectControl('filterPreset', '物种过滤策略', 'standard', [
        { value: 'unfiltered', label: '不筛选（保留全部物种）' },
        { value: 'inclusive', label: '宽松（相对丰度 ≥0.001%，检出率 ≥5%）' },
        { value: 'standard', label: '标准（相对丰度 ≥0.01%，检出率 ≥10%）' },
        { value: 'robust', label: '稳健（相对丰度 ≥0.05%，检出率 ≥20%）' },
      ], 'ordination_filter')],
      requirement: '至少 3 个样本；过滤不使用 AD/NC 标签；两组均不少于 3 个样本时进行探索性 PERMANOVA 与正/负轴校正的 PERMDISP',
      inference: {
        method: 'permanova_with_permdisp',
        minPerGroup: 3,
        ellipse: 'group_data_distribution_95',
      },
    }),
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
  topN = null,
  parameters = {},
} = {}) {
  return { featureKind, featureLabel, summary, chartData, topN, parameters };
}

export function resolveChartMeta(chartType, contextInput = {}) {
  const chart = CHART_REGISTRY[chartType];
  if (!chart) return null;

  const context = chartContext(contextInput);
  const policy = chart.analysisPolicy || analysisPolicy({ scopes: ALL_SCOPES });
  const controls = (policy.controls || []).map(control => ({
    ...control,
    label: resolveChartText(control.label, context),
  }));
  const resolvedPolicy = {
    ...policy,
    scope: { ...policy.scope },
    controls,
  };
  return {
    ...chart,
    key: chartType,
    label: resolveChartText(chart.navLabel, context),
    subtitle: resolveChartText(chart.navSubtitle, context),
    title: resolveChartText(chart.title || chart.navLabel, context),
    frameSubtitle: resolveChartText(chart.subtitle || chart.navSubtitle, context),
    controls,
    supportedScopes: resolvedPolicy.scope.allowed,
    scopeRequirement: resolvedPolicy.scope.requirement,
    analysisPolicy: resolvedPolicy,
  };
}

export function getAvailableCharts(featureKind = 'taxonomy', featureLabel = '物种', availableArtifacts) {
  const actualArtifacts = Array.isArray(availableArtifacts)
    ? new Set(availableArtifacts.map(key => (key === 'lda' ? 'differential_ko' : key)))
    : null;
  return Object.entries(CHART_REGISTRY)
    .filter(([key, chart]) => {
      if (!chart.availableFor.includes(featureKind)) return false;
      if (chart.availability === 'analysis_projection') return true;
      const requiredArtifact = chart.requiredArtifact || chart.dataKey || key;
      return actualArtifacts === null || actualArtifacts.has(requiredArtifact);
    })
    .map(([key]) => resolveChartMeta(key, { featureKind, featureLabel }));
}

export function getChartDefinition(chartType) {
  const chart = CHART_REGISTRY[chartType];
  if (!chart) return null;
  const policy = chart.analysisPolicy || analysisPolicy({ scopes: ALL_SCOPES });
  return {
    ...chart,
    supportedScopes: policy.scope.allowed,
    controls: policy.controls,
    scopeRequirement: policy.scope.requirement,
  };
}
