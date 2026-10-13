const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const tooltip = { trigger: 'item', renderMode: 'richText', confine: true };

export function mappingResearchOption(data, preferences) {
  const style = { mappingView: 'auto', groupBy: 'disease', ...preferences };
  const constant = new Set(data.items.map(item => item.aboveThresholdMagCount)).size <= 1;
  const distribution = style.mappingView === 'distribution' || (style.mappingView === 'auto' && constant);
  const byBatch = style.groupBy === 'batch';
  const groups = byBatch ? [...new Set(data.items.map(row => String(row.batch)))].sort((a, b) => Number(a) - Number(b)) : ['AD', 'NC'];
  return { tooltip: { ...tooltip, formatter: p => {
    const row = p.data.details;
    return `${row.sampleId} · ${row.disease} · Batch ${row.batch}\n映射 ${number(row.mappedPercent)}% · 未映射 ${number(row.unmappedPercent)}%\n超过阈值 ${row.aboveThresholdMagCount} 个 MAG`;
  } }, legend: { top: 0 }, grid: { left: 78, right: 40, top: 48, bottom: 62 },
    xAxis: { type: 'value', min: 0, max: 100, name: '映射到代表 MAG 的比例（%）', nameLocation: 'middle', nameGap: 35 },
    yAxis: distribution ? { type: 'value', min: 0, max: groups.length + 1, interval: 1, name: byBatch ? 'HPC 批次' : '疾病分组', axisLabel: { formatter: value => groups[value - 1] == null ? '' : byBatch ? `Batch ${groups[value - 1]}` : groups[value - 1] }, splitLine: { show: false } }
      : { type: 'value', min: 0, max: data.provenance.magCount, minInterval: 1, name: '超过丰度阈值的 MAG 数' },
    series: groups.map((group, index) => ({ id: `mapping-${byBatch ? 'batch' : 'disease'}-${group}`, name: byBatch ? `Batch ${group}` : group, type: 'scatter',
      data: data.items.filter(row => (byBatch ? String(row.batch) : row.disease) === group).map((row, i) => ({ name: row.sampleId, details: row,
        value: [row.mappedPercent, distribution ? index + 1 + ((i % 9) - 4) * 0.035 : row.aboveThresholdMagCount] })) })) };
}

export function lineageResearchOption(data, preferences) {
  const bySource = preferences.groupBy === 'source';
  const groups = bySource ? ['CHN', 'CHN2'] : ['AD', 'NC'];
  return { tooltip: { ...tooltip, formatter: p => {
    const row = p.data.details;
    return `${row.memberMag}\n${row.memberSourceSampleId} · ${row.memberDisease} · ${row.memberGroup}\nANI ${number(row.memberToRepAni * 100)}%\n成员→代表比对比例 ${number(row.memberToRepAlignmentCoverage * 100)}%\n${row.isRepresentative ? '代表自身' : '聚类成员'}`;
  } }, legend: { top: 0 }, grid: { left: 72, right: 40, top: 48, bottom: 62 },
    xAxis: { type: 'value', scale: true, name: '成员→代表实际 ANI（%）', nameLocation: 'middle', nameGap: 35 },
    yAxis: { type: 'value', min: 0, max: 100, name: '基因组比对比例（%）' },
    series: groups.map((group, index) => ({ name: group, type: 'scatter',
      data: data.items.filter(row => (bySource ? row.memberGroup : row.memberDisease) === group).map(row => ({ name: row.memberMag,
        magId: row.memberMag, details: row, symbol: row.isRepresentative ? 'diamond' : 'circle',
        value: [row.memberToRepAni * 100, row.memberToRepAlignmentCoverage * 100] })),
      ...(index === 0 ? { markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#a36d7e' },
        data: [{ xAxis: 95, label: { formatter: 'ANI 95% 参考' } }] } } : {}) })) };
}
