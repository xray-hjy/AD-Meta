const SCOPE_LABELS = {
  cohort: '全部样本',
  group: '分组样本',
  subset: '自定义子集',
  sample: '单个样本',
};

function projectionSummary(data) {
  const projection = data.projection;
  if (projection.kind === 'ko_contribution') {
    const series = Array.isArray(data.payload?.series) ? data.payload.series : [];
    const coverage = projection.coverageBySeries || {};
    return [
      `展示共享排名前 ${projection.returnedFeatureCount}/${projection.sourceFeatureCount} 个 KO`,
      `${projection.truncatedFeatureCount || 0} 个 KO 未进入当前图，且未合并为 Other`,
      ...series.map(item => `${item.label} 累计覆盖 ${formatPercent(coverage[item.key])}`),
      '各样本先进行总和标准化，再计算组均值',
    ];
  }
  if (projection.projectionUnit === 'taxonomy_nodes') {
    return [
      `来源 ${projection.sourceFeatureCount} 个${data.featureLabel}`,
      `展示 ${projection.displayedNodeCount || 0} 个分类层级节点`,
      projection.mergedCategoryCount > 0
        ? `聚合 ${projection.mergedCategoryCount} 个长尾分类`
        : '未聚合分类',
    ];
  }
  if (projection.projectionUnit === 'categories') {
    return [
      `来源 ${projection.sourceFeatureCount} 个${data.featureLabel}`,
      `汇总为 ${projection.sourceCategoryCount || 0} 个类别`,
      projection.mergedFeatureCount > 0
        ? `展示 ${projection.displayedCategoryCount || 0} 项，末尾聚合 ${projection.mergedFeatureCount} 类`
        : `完整展示 ${projection.displayedCategoryCount || 0} 类`,
    ];
  }
  if (projection.kind === 'pca') {
    const selection = projection.featureSelection?.method === 'top_n_by_total_abundance'
      ? '按总丰度排序选取'
      : '按当前策略选取';
    return [
      `${selection} ${projection.returnedFeatureCount}/${projection.sourceFeatureCount} 个${data.featureLabel}`,
      `绘制 ${projection.samplePointCount || projection.sampleCount} 个样本点`,
      '逐特征 Z-score 标准化',
    ];
  }
  if (projection.kind === 'pcoa') {
    const selection = projection.featureSelection || {};
    const status = projection.inference?.permanovaStatus;
    const retainedMass = projection.retainedMass || selection.retainedMass || {};
    const messages = [
      `无标签过滤保留 ${projection.returnedFeatureCount}/${projection.sourceFeatureCount} 个${data.featureLabel}`,
      selection.preset === 'unfiltered'
        ? '未启用稀有特征过滤'
        : `相对丰度 ≥ ${formatPercent(selection.minimumRelativeAbundance)}，检出率 ≥ ${formatPercent(selection.minimumPrevalence)}`,
      `过滤前后均按样本总和闭合；平均保留质量 ${formatPercent(retainedMass.mean)}`,
      `同一 Bray-Curtis 距离矩阵绘制 ${projection.samplePointCount || projection.sampleCount} 个样本点`,
    ];
    if (status === 'computed_exploratory_unadjusted') {
      messages.push('已计算探索性未校正 PERMANOVA，并以 PERMDISP 检查组内离散度');
    } else if (status === 'not_applicable_single_group') {
      messages.push('当前为单组排序探索，不进行组间检验');
    } else if (status === 'not_applicable_minimum_group_size') {
      messages.push('组内样本量不足，不进行组间检验');
    } else {
      messages.push('当前数据不足，不进行组间检验');
    }
    return messages;
  }
  if (projection.kind === 'heatmap') {
    const parameters = projection.parameters || {};
    return [
      `来源 ${projection.sourceFeatureCount} 个${data.featureLabel}`,
      `筛得 ${projection.eligibleFeatureCount || 0} 个满足 q < ${parameters.qValueMax} 且 |log2FC| > ${parameters.log2FcMinAbs} 的候选`,
      `展示排名前 ${projection.returnedFeatureCount || 0} 个`,
    ];
  }
  if (projection.kind === 'detection') {
    return [
      `来源 ${projection.sourceFeatureCount} 个${data.featureLabel}`,
      `检出 ${projection.eligibleFeatureCount || 0} 个丰度 > 0 的特征`,
      `按 AD/NC 检出率差值展示前 ${projection.returnedFeatureCount || 0} 个`,
    ];
  }
  if (projection.kind === 'differential_ko') {
    const parameters = projection.parameters || {};
    return [
      `${projection.testedFeatureCount || 0} 个 KO 通过最低检出比例 ${parameters.prevalenceMin} 并进入检验`,
      `${projection.eligibleFeatureCount || 0} 个满足 BH-FDR q < ${parameters.qValueMax}`,
      `按组间效应平衡展示 ${projection.returnedFeatureCount || 0} 个`,
    ];
  }
  return [
    `展示 ${projection.returnedFeatureCount}/${projection.sourceFeatureCount} 个${data.featureLabel}`,
    projection.truncatedFeatureCount > 0
      ? `${projection.truncatedFeatureCount} 个未进入当前浏览器投影，完整结果仍保留在后端`
      : '当前范围完整展示',
  ];
}

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`;
}

export default function ProjectionDisclosure({ data, fetching = false }) {
  const projection = data?.projection;
  if (!projection) return null;
  const scopeLabel = data.scope?.mode === 'group'
    ? `${data.scope.groups?.[0] || ''} 组`
    : data.scope?.mode === 'sample'
      ? data.scope.sampleCodes?.[0]
      : SCOPE_LABELS[data.scope?.mode] || '当前范围';

  return (
    <div className="projection-disclosure" aria-live="polite">
      <span className="projection-disclosure__scope">{scopeLabel}</span>
      <span>基于 {projection.sampleCount} 个样本</span>
      {projectionSummary(data).map(message => <span key={message}>{message}</span>)}
      {data.dataSemantics?.normalization === 'unknown' ? (
        <span className="projection-disclosure__warning">上游标准化方式待确认</span>
      ) : null}
      {fetching ? <span className="projection-disclosure__updating">正在更新</span> : null}
    </div>
  );
}
