export const ANALYSIS_DOMAINS = [
  {
    key: 'species',
    label: '群落物种',
    eyebrow: 'COMMUNITY TAXONOMY',
    description: '基于 Sample × Species 矩阵分析群落组成、物种差异、分类层级与样本结构。',
    featureKinds: ['taxonomy'],
    analysisData: {
      label: '物种丰度矩阵',
      shape: 'Sample × Species',
    },
    status: 'available',
    modules: [
      { label: '组成概览', status: 'available' },
      { label: '分布与差异', status: 'available' },
      { label: '分类层级', status: 'available' },
      { label: '样本结构', status: 'available' },
    ],
    navigationSections: [
      { key: 'composition', label: '组成概览', charts: ['species', 'phylum'] },
      { key: 'difference', label: '分布与差异', charts: ['boxplot', 'heatmap'] },
      { key: 'hierarchy', label: '分类层级', charts: ['taxonomyHierarchy'] },
      { key: 'ordination', label: '样本结构', charts: ['pca', 'pcoa'] },
    ],
  },
  {
    key: 'function',
    label: '群落功能',
    eyebrow: 'COMMUNITY FUNCTION',
    description: '基于 Sample × KO 矩阵比较功能组成、检出情况与组间效应方向。',
    featureKinds: ['ko'],
    analysisData: {
      label: 'KO 功能丰度矩阵',
      shape: 'Sample × KO',
    },
    status: 'available',
    modules: [
      { label: '功能概览', status: 'available' },
      { label: '检出与差异', status: 'available' },
      { label: '样本结构', status: 'planned' },
      { label: '通路解释', status: 'planned' },
    ],
    navigationSections: [
      { key: 'composition', label: '功能概览', charts: ['species', 'koContribution'] },
      { key: 'difference', label: '检出与差异', charts: ['detection', 'differential_ko'] },
    ],
  },
  {
    key: 'joint',
    label: '物种-功能联合',
    eyebrow: 'CROSS-DOMAIN ANALYSIS',
    description: '面向样本层面的物种与功能关联分析，严格区分相关关系与功能归属。',
    featureKinds: [],
    status: 'planned',
    modules: [
      { label: '相关模式', status: 'planned' },
      { label: '联合排序', status: 'planned' },
      { label: '关联网络', status: 'planned' },
    ],
    navigationSections: [],
  },
  {
    key: 'mag',
    label: 'MAG 解析',
    eyebrow: 'GENOME-RESOLVED METAGENOMICS',
    description: '基于 mag_v2 开展 MAG 丰度、GTDB 分类、CheckM2 质量与技术质控；功能注释及跨队列复现按数据就绪度逐步接入。',
    featureKinds: ['mag'],
    analysisData: {
      label: 'MAG 相对丰度矩阵',
      shape: 'Sample × MAG',
    },
    route: '/analysis/mag',
    status: 'available',
    modules: [
      { label: '丰度分析', status: 'available' },
      { label: 'MAG 分类', status: 'available' },
      { label: 'MAG 功能注释', status: 'planned' },
      { label: 'MAG 质量', status: 'available' },
      { label: '跨队列复现', status: 'planned' },
      { label: '技术质控', status: 'available' },
    ],
    navigationSections: [
      { key: 'abundance', label: '丰度分析', charts: ['features', 'distribution', 'heatmap'] },
      { key: 'annotation', label: '注释解析', charts: ['taxonomy', 'function'] },
      { key: 'quality', label: '质量与复现', charts: ['quality', 'replication'] },
      { key: 'qc', label: '技术质控', charts: ['mapping'] },
    ],
  },
];

export function getAnalysisDomainForFeatureKind(featureKind = 'taxonomy') {
  return ANALYSIS_DOMAINS.find(domain => domain.featureKinds.includes(featureKind))
    || ANALYSIS_DOMAINS[0];
}

export function getNavigationSections(featureKind = 'taxonomy') {
  return getAnalysisDomainForFeatureKind(featureKind).navigationSections;
}

export function getAnalysisDataForFeatureKind(featureKind = 'taxonomy') {
  return getAnalysisDomainForFeatureKind(featureKind).analysisData || {
    label: '分析数据',
    shape: '',
  };
}

export function getDatasetForDomain(datasets, domain) {
  if (!domain || domain.status !== 'available') return null;
  return datasets.find(dataset => domain.featureKinds.includes(dataset.featureKind)) || null;
}
