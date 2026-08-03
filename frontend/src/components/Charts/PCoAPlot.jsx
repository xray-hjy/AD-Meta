import OrdinationChart from './OrdinationChart';

function PCoAPlot({ data }) {
  const permanova = data?.permanova;
  const permdisp = data?.permdisp;
  const statusText = {
    not_applicable_single_group: '当前为单组探索，不进行组间检验',
    not_applicable_minimum_group_size: `每组至少需要 ${data?.inferenceMinimumPerGroup || 3} 个样本，未进行组间检验`,
    not_applicable_insufficient_data: '样本或特征不足，未进行组间检验',
  };
  const inferenceText = permanova
    ? `探索性未校正 PERMANOVA R²=${Number(permanova.r2 || 0).toFixed(4)} · F=${Number(permanova.fStat || 0).toFixed(4)} · p=${Number(permanova.pValue || 1).toFixed(4)} · permutations=${permanova.nPerm}`
    : statusText[data?.permanovaStatus] || '未进行 PERMANOVA';
  const dispersionText = permdisp
    ? `PERMDISP F=${Number(permdisp.fStat || 0).toFixed(4)} · p=${Number(permdisp.pValue || 1).toFixed(4)} · permutations=${permdisp.nPerm}`
    : null;
  const negativeCount = Number(data?.eigenDiagnostics?.negativeEigenvalueCount || 0);
  const selection = data?.featureSelection || {};
  const retainedMass = selection.retainedMass || {};
  const filterText = selection.preset === 'unfiltered'
    ? `不筛选 · ${selection.selectedCount || 0}/${selection.sourceFeatureCount || 0} 个物种`
    : `${selection.preset || 'standard'} 过滤 · 相对丰度 ≥${formatPercent(selection.minimumRelativeAbundance)} · 检出率 ≥${formatPercent(selection.minimumPrevalence)} · 保留 ${selection.selectedCount || 0}/${selection.sourceFeatureCount || 0} 个物种`;
  const footer = [
    'Bray-Curtis · 样本内相对丰度',
    filterText,
    retainedMass.mean != null ? `平均保留质量 ${formatPercent(retainedMass.mean)}` : null,
    inferenceText,
    dispersionText,
    negativeCount ? `负特征值 ${negativeCount} 个（解释率按正特征值计算）` : null,
  ].filter(Boolean).join(' · ');

  return <OrdinationChart data={data} footer={footer} />;
}

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(3)}%`;
}

export default PCoAPlot;
