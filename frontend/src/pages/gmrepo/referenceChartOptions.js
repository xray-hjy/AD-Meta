const BLUE = '#0072b2';
const GOLD = '#a76808';
const GRID = '#e8edf3';

const axis = { type: 'value', min: 0, splitNumber: 3, axisLabel: { color: '#526075', hideOverlap: true }, splitLine: { lineStyle: { color: GRID } } };

function base(labels, left = 135) {
  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: '#172033' },
    grid: { left, right: 48, top: 42, bottom: 36 },
    tooltip: { trigger: 'axis', confine: true, renderMode: 'richText', axisPointer: { type: 'shadow' } },
    legend: { top: 3, left: 'center' },
    xAxis: { ...axis, name: 'Run 数', nameLocation: 'middle', nameGap: 24, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#172033' } },
  };
}

export function referenceChartOption(kind, data, colors) {
  if (kind === 'cohorts') {
    const cohorts = data.cohorts.filter(c => c.plotReadyRuns > 0).sort((a, b) => b.plotReadyRuns - a.plotReadyRuns || a.projectId.localeCompare(b.projectId));
    return { ...base(cohorts.map(c => c.projectId)), series: ['AD', 'NC'].map(group => ({
      name: group, type: 'bar', stack: 'runs', barMaxWidth: 28, itemStyle: { color: colors[group] },
      label: { show: true, formatter: p => p.value ? String(p.value) : '', color: '#fff', fontWeight: 600 },
      data: cohorts.map(c => group === 'AD' ? c.adRuns : c.ncRuns),
    })) };
  }
  if (kind === 'decisions') {
    const option = base(data.decisions.map(d => d.label), 174);
    option.yAxis.axisLabel = { ...option.yAxis.axisLabel, width: 158, overflow: 'break', lineHeight: 15 };
    return { ...option, legend: { show: false }, series: [{
      type: 'bar', name: '记录数', barMaxWidth: 23, itemStyle: { color: BLUE },
      label: { show: true, position: 'right', color: '#172033' }, data: data.decisions.map(d => d.count),
    }] };
  }
  if (kind === 'missingness') {
    const option = base(data.missingness.map(d => d.label), 150);
    return { ...option, xAxis: { ...axis, max: 100, name: '占完整 profile 的比例（%）', nameLocation: 'middle', nameGap: 24 },
      series: [{ name: '可标准化', type: 'bar', stack: 'quality', barMaxWidth: 35, itemStyle: { color: BLUE },
        data: data.missingness.map(d => d.denominator ? d.knownCount / d.denominator * 100 : null) },
      { name: '缺失或未标准化', type: 'bar', stack: 'quality', barMaxWidth: 35, itemStyle: { color: GOLD },
        data: data.missingness.map(d => d.unavailablePercent) }],
    };
  }
  const option = base(data.resolution.map(r => r.projectId));
  return { ...option, legend: { show: false }, xAxis: { ...axis, max: 100, name: '待解析比例中位数（%）', nameLocation: 'middle', nameGap: 24 },
    series: [{ type: 'bar', name: '待解析比例（%）', barMaxWidth: 24, itemStyle: { color: GOLD },
      label: { show: true, position: 'right', color: '#172033', formatter: p => `${Number(p.value).toFixed(1)}%` },
      data: data.resolution.map(r => r.medianUnresolvedPercent),
    }],
  };
}
