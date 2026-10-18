import { useState } from 'react';
import { HeatmapChart } from 'echarts/charts';
import { VisualMapComponent, TitleComponent } from 'echarts/components';
import { echarts } from '../../components/Charts/EChartBase';
import ChartFrame from '../../components/Charts/ChartFrame';
import ResearchChartSurface from '../../components/Charts/ResearchChartSurface';
import ChartStyleToolbar from '../../components/Charts/ChartStyleToolbar';
import useChartStylePreferences from '../../components/Charts/useChartStylePreferences';
import { resolveResearchPalette, researchPaletteOptions } from '../../components/Charts/researchPalettes';
import { useColorVision } from '../../context/ColorVisionContext';
import SegmentedControl from '../../components/ui/SegmentedControl';

echarts.use([HeatmapChart, VisualMapComponent, TitleComponent]);
const fmt = n => n == null ? '—' : Number(n).toLocaleString('zh-CN', { maximumSignificantDigits: 4 });
const escape = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function effectRows(record) {
  const main = record.primary?.genusComparison;
  return [...(main?.statistic ? [{ name: '主队列 · WGS', statistic: main.statistic, ci: main.rankBiserialCi, projectId: 'primary' }] : []),
    ...record.cohorts.map(r => ({ name: r.projectId, statistic: r.statistic, ci: r.rankBiserialCi, projectId: r.projectId }))];
}

export function buildEffectOption({ rows, candidates, adjusted, colors, style, width = 1400, title, footnote }) {
  const matrix = Boolean(candidates);
  const labels = matrix ? candidates.map(r => r.name) : rows.map(r => r.name);
  const columns = matrix ? ['主队列 · WGS', ...rows.map(r => r.name)] : [];
  const cells = [];
  if (matrix) candidates.forEach((c, y) => [c.primaryStatistic, ...rows.map(r => c.cohorts.find(v => v.projectId === r.projectId)?.statistic)].forEach((s, x) => {
    const effect = adjusted ? s?.adjusted?.effect : s?.rankBiserial;
    if (effect != null) cells.push({ value: [x, y, effect], entityId: c.candidateId, name: c.name, statistic: s, cohort: columns[x] });
  }));
  const q = s => adjusted ? s?.adjusted?.qValue : s?.qValue;
  const tip = datum => {
    const s = datum.statistic;
    return `${escape(datum.name || '')}${datum.cohort ? ` · ${escape(datum.cohort)}` : ''}<br/>AD / NC：${s?.adCount ?? '—'} / ${s?.ncCount ?? '—'}<br/>效应：${fmt(adjusted ? s?.adjusted?.effect : s?.rankBiserial)}<br/>p：${fmt(adjusted ? s?.adjusted?.pValue : s?.pValue)} · q：${fmt(q(s))}`;
  };
  const base = {
    animation: false, textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif', fontSize: Number(style.fontSize) },
    title: [{ text: title, left: 24, top: 10, textStyle: { fontSize: 15, color: '#263b50' } },
      { text: footnote, left: 24, bottom: 5, textStyle: { fontSize: 10, fontWeight: 'normal', color: '#607087', width: width - 48, overflow: 'break' } }],
    grid: { left: 210, right: matrix ? 100 : 55, top: 65, bottom: 100 },
    tooltip: { show: style.hover, trigger: 'item', formatter: p => tip(p.data), confine: true },
    xAxis: matrix ? { type: 'category', data: columns, position: 'top', axisLabel: { interval: 0, rotate: columns.length > 4 ? 18 : 0 } }
      : { type: 'value', min: adjusted ? undefined : -1, max: adjusted ? undefined : 1, name: adjusted ? 'AD − NC · 百分位秩点差' : 'AD 偏低 ← 秩二列相关 → AD 偏高', nameLocation: 'middle', nameGap: 35, splitLine: { show: style.grid, lineStyle: { color: '#edf2f7' } } },
    yAxis: { type: 'category', inverse: true, data: labels, axisTick: { show: false }, axisLabel: { width: 190, overflow: style.fullNames ? 'break' : 'truncate', interval: 0 }, splitArea: { show: matrix, areaStyle: { color: ['#f5f7fa', '#fafbfc'] } } },
  };
  if (matrix) return { ...base, visualMap: { min: adjusted ? -100 : -1, max: adjusted ? 100 : 1, dimension: 2, orient: 'vertical', right: 10, top: 'middle', text: ['AD 偏高', 'NC 偏高'], inRange: { color: [colors[0], '#f5f5f5', colors[1]] } },
    series: [{ type: 'heatmap', data: cells, label: { show: style.labels, formatter: p => `${fmt(p.value[2])}${q(p.data.statistic) < .05 ? ' *' : ''}`, color: '#182f45' }, itemStyle: { borderWidth: 3, borderColor: '#fff' } }] };
  const points = rows.flatMap((r, y) => {
    const effect = adjusted ? r.statistic?.adjusted?.effect : r.statistic?.rankBiserial;
    const ci = adjusted ? [r.statistic?.adjusted?.ciLow, r.statistic?.adjusted?.ciHigh] : r.ci;
    return effect == null ? [] : [{ value: [effect, y, ci?.[0] ?? effect, ci?.[1] ?? effect], ...r, entityId: r.projectId,
      itemStyle: { color: q(r.statistic) < .05 ? colors[effect < 0 ? 0 : 1] : '#fff', borderColor: colors[effect < 0 ? 0 : 1], borderWidth: 2 } }];
  });
  return { ...base, series: [
    { type: 'custom', silent: true, data: points, renderItem: (params, api) => {
      const y = api.value(1), a = api.coord([api.value(2), y]), b = api.coord([api.value(3), y]);
      return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#6f8193', lineWidth: 2 } },
        ...[a, b].map(p => ({ type: 'line', shape: { x1: p[0], y1: p[1] - 5, x2: p[0], y2: p[1] + 5 }, style: { stroke: '#6f8193' } }))] };
    } },
    { type: 'scatter', data: points, symbolSize: 10, label: { show: style.labels, position: 'right', formatter: p => fmt(p.value[0]) }, markLine: { symbol: 'none', silent: true, data: [{ xAxis: 0 }], lineStyle: { color: '#99a6b4' } } },
  ] };
}

export default function EvidenceEffectChart({ record, candidates, onSelect }) {
  const [adjusted, setAdjusted] = useState(false);
  const prefs = useChartStylePreferences(candidates ? 'gmrepo-candidate-matrix' : 'gmrepo-effect-forest');
  const { colorBlindFriendly } = useColorVision();
  const style = { palette: colorBlindFriendly ? 'okabe-ito' : 'npg', labels: true, hover: true, grid: true, fullNames: false, fontSize: '11', ...prefs.values };
  const rows = candidates ? record.cohorts.map(r => ({ name: r.projectId, projectId: r.projectId })) : effectRows(record);
  const title = candidates ? '候选 × 研究队列 · 效应对照' : `${record.genus.name} · 主外同属效应`;
  const mainFamily = record.primaryFamilySize || record.primary?.genusComparison?.familySize;
  const footnote = `主队列检验族 ${mainFamily || '未计算'} 属；外部各 ${record.externalFamilySize || record.familySize} 属；${adjusted ? '年龄/性别调整，百分位秩点差' : '未调整秩效应'}。${candidates ? '空格＝未计算/无唯一映射，*＝q < 0.05；' : '实心点＝q < 0.05；横线＝95% CI；'}并列参考，非独立验证。`;
  const colors = resolveResearchPalette('evidence', style).colors;
  const count = candidates?.length || rows.length;
  const world = { width: 1200, height: Math.max(520, count * 32 + 180) };
  const option = { ...buildEffectOption({ rows, candidates, adjusted, colors, style, title, footnote }), title: [] };
  const exportSpec = { fileName: candidates ? 'gmrepo-candidate-effects' : 'gmrepo-main-external-effects', suggestedSize: { width: 1600, height: world.height },
    buildOption: size => buildEffectOption({ rows, candidates, adjusted, colors, style, title: `${title}\n${record.evaluationId ? `评估 ${record.evaluationId}` : '当前选择（未冻结）'}`, footnote, ...size }) };
  return <ChartFrame title={title} sectioned subtitle={footnote} chartControls={<>
    <SegmentedControl role="group" aria-label="效应模型"><button type="button" aria-pressed={!adjusted} onClick={() => setAdjusted(false)}>未调整</button><button type="button" aria-pressed={adjusted} onClick={() => setAdjusted(true)}>年龄 / 性别调整</button></SegmentedControl>
    <ChartStyleToolbar fields={[{ key: 'palette', label: '配色', type: 'palette', options: researchPaletteOptions('evidence'), discrete: true },
      ...['labels', 'hover', 'grid', 'fullNames'].map((key, i) => ({ key, label: ['数值', '悬浮', '网格', '完整名称'][i], type: 'switch', more: i > 1 })),
      { key: 'fontSize', label: '文字大小', more: true, options: [{ value: '10', label: '小' }, { value: '11', label: '中' }, { value: '13', label: '大' }] }]}
      values={style} onChange={prefs.update} onReset={prefs.reset} />
  </>}>
    <ResearchChartSurface option={option} world={world} resetKey={`${record.evaluationId || record.provenance.fingerprint}:${adjusted}:${candidates?.map(r => r.candidateId).join(',') || record.genus.featureId}`}
      label={title} onSelect={onSelect} exportSpec={exportSpec} exportLabel="导出证据图形" height={world.height} />
    {!candidates && rows.some(r => !r.statistic) && <p className="gmrepo-note">仅描述或分类未对应的队列保留空行，未绘为零效应。恒定指标的调整区间不估计，表格保留状态。</p>}
  </ChartFrame>;
}
