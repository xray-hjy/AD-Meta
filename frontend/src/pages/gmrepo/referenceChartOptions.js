const BLUE = '#0072b2';
const GOLD = '#a76808';
const GRID = '#e8edf3';
export const DECISION_CHART_HEIGHT = 248;

const axis = { type: 'value', min: 0, splitNumber: 3, axisLabel: { color: '#526075', hideOverlap: true }, splitLine: { lineStyle: { color: GRID } } };

function base(labels, { left = 103, top = 10 } = {}) {
  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: '#172033' },
    grid: { left, right: 46, top, bottom: 41 },
    tooltip: { trigger: 'axis', confine: true, renderMode: 'richText', axisPointer: { type: 'shadow' } },
    legend: { top: 3, left: 'center' },
    xAxis: { ...axis, name: 'Run 数', nameLocation: 'middle', nameGap: 24, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#172033' } },
  };
}

export function referenceChartOption(kind, data, colors) {
  if (kind === 'cohorts') {
    const cohorts = data.cohorts.filter(c => c.plotReadyRuns > 0).sort((a, b) => b.plotReadyRuns - a.plotReadyRuns || a.projectId.localeCompare(b.projectId));
    const option = base(cohorts.map(c => c.projectId), { top: 32 });
    const groups = ['AD', 'NC'];
    const series = groups.map(group => ({
      name: group, type: 'bar', stack: 'runs', barMaxWidth: 23, itemStyle: { color: colors[group] },
      label: { show: true, position: 'inside', formatter: p => p.value ? String(p.value) : '', color: '#fff', fontWeight: 600 },
      data: cohorts.map(c => group === 'AD' ? c.adRuns : c.ncRuns),
    }));
    series.push({
      name: '合计', type: 'bar', stack: 'runs', stackStrategy: 'all', silent: true,
      itemStyle: { color: 'transparent' },
      label: { show: true, position: 'right', formatter: p => String(cohorts[p.dataIndex].plotReadyRuns), color: '#172033' },
      data: cohorts.map(() => 0),
    });
    return { ...option, legend: { ...option.legend, data: groups, selectedMode: false }, series,
      tooltip: { ...option.tooltip, formatter: ([first]) => {
        const row = cohorts[first.dataIndex];
        return `${row.projectId}\nAD ${row.adRuns} · NC ${row.ncRuns} · 合计 ${row.plotReadyRuns} Run`;
      } } };
  }
  if (kind === 'decisions') {
    const option = base(data.decisions.map(d => d.label), { left: 140 });
    option.yAxis.axisLabel = { ...option.yAxis.axisLabel, width: 124, overflow: 'break', lineHeight: 13 };
    return { ...option, legend: { show: false }, series: [{
      type: 'bar', name: '记录数', barMaxWidth: 23, itemStyle: { color: BLUE },
      label: { show: true, position: 'right', color: '#172033' }, data: data.decisions.map(d => d.count),
    }] };
  }
  const resolution = [...data.resolution].sort((a, b) => b.medianUnresolvedPercent - a.medianUnresolvedPercent || a.projectId.localeCompare(b.projectId));
  const option = base(resolution.map(r => r.projectId));
  const formatPercent = value => `${Number(value).toFixed(1)}%`;
  return { ...option, legend: { show: false }, xAxis: { ...axis, max: 100, interval: 25,
    axisLabel: { ...axis.axisLabel, formatter: '{value}%' }, name: '待解析比例中位数', nameLocation: 'middle', nameGap: 24 },
    tooltip: { ...option.tooltip, valueFormatter: formatPercent },
    series: [{ type: 'bar', name: '待解析比例（%）', barMaxWidth: 24, itemStyle: { color: GOLD },
      label: { show: true, position: 'right', color: '#172033', formatter: p => formatPercent(p.value) },
      data: resolution.map(r => r.medianUnresolvedPercent),
    }],
  };
}
