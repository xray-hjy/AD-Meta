// @vitest-environment node
import { init, use as registerCharts } from 'echarts/core';
import { BoxplotChart, ScatterChart, CustomChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { applyBoxStyle, boxStyleDefaults, cleanBoxStyle } from './boxStyle';
import { buildBoxScatterOption } from './BoxScatterChart';

registerCharts([BoxplotChart, ScatterChart, CustomChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);
const model = {
  available: [{ featureId: 'MAG-1', shortName: 'MAG-1', values: {
    AD: { raw: { box: [0, 1, 2, 3, 5], samplePoints: [{ sample: 'AD-zero', value: 0 }, { sample: 'AD-one', value: 2 }] } },
    NC: { raw: { box: [0, 1, 1.5, 3, 4], samplePoints: [{ sample: 'NC-one', value: 1.5 }] } },
  } }],
  series: [{ key: 'AD', label: 'AD', color: '#e74c3c' }, { key: 'NC', label: 'NC', color: '#2ecc71' }],
  activeTransform: { key: 'raw', label: '相对丰度（%）' }, layout: 'groups', scatterMode: 'all',
  groupCounts: { AD: 2, NC: 1 }, boxWidth: [35, 90], formatValue: value => `${value}%`,
};

test('hiding points retains zero values, sample identities, boxes, extent and tooltip semantics', () => {
  const original = buildBoxScatterOption(model);
  const styled = applyBoxStyle(original, { points: false, grid: false, width: 'thick' });
  expect(styled.series.map(series => series.data)).toEqual(original.series.map(series => series.data));
  expect(styled.series[1].data[0]).toMatchObject({ sample: 'AD-zero', value: ['AD', 0] });
  expect(styled.series[1]).toMatchObject({ symbolSize: 0, silent: true, itemStyle: { opacity: 0 }, tooltip: { show: false } });
  expect(styled.series[0].boxWidth).toEqual([45.5, 117]);
  expect(styled.yAxis.splitLine.show).toBe(false);
  expect(styled.dataZoom).toBe(original.dataZoom);
  expect(styled.tooltip).toBe(original.tooltip);
  expect(original.series[1].symbolSize).toBe(6);
  expect(applyBoxStyle(original, {})).toBe(original);
});

test('median annotations render into SVG with percent units and no toolbar markup', () => {
  const original = buildBoxScatterOption(model);
  const styled = applyBoxStyle(original, { medians: true }, { formatValue: model.formatValue });
  expect(styled.series.slice(0, original.series.length)).toEqual(original.series);
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 900, height: 430 });
  try {
    chart.setOption(styled);
    const svg = chart.renderToSVGString();
    expect(svg).toContain('2%');
    expect(svg).toContain('1.5%');
    expect(svg).not.toContain('图形样式');
    expect(svg).not.toContain('中位数值');
  } finally { chart.dispose(); }
});

test('paired boxes label existing transformed medians, not raw abundance or recomputed summaries', () => {
  const original = buildBoxScatterOption({ ...model, layout: 'features', scatterMode: 'outliers', visibleCount: 1,
    activeTransform: { key: 'raw', label: 'log10(丰度 + 1)' } });
  const styled = applyBoxStyle(original, { medians: true, pointSize: 'large', opacity: 'light', font: 'large' },
    { formatValue: value => value.toFixed(4) });
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 900, height: 430 });
  try {
    chart.setOption(styled);
    const svg = chart.renderToSVGString();
    expect(svg).toContain('2.0000');
    expect(svg).toContain('1.5000');
    expect(styled.series[0].data).toBe(original.series[0].data);
    expect(styled.series[1].data).toBe(original.series[1].data);
    expect(styled.yAxis.name).toBe('log10(丰度 + 1)');
  } finally { chart.dispose(); }
});

test('unknown preferences are ignored and non-box charts stay untouched', () => {
  expect(cleanBoxStyle({ width: 'gigantic', points: 'false', opacity: 'invalid', font: 'large' })).toEqual({ font: 'large' });
  const option = { series: [{ type: 'scatter', data: [[1, 2]] }] };
  expect(applyBoxStyle(option, { points: false })).toBe(option);
});

test('gray point outlines export to SVG without changing point fill, data or boxes', () => {
  const original = buildBoxScatterOption(model);
  const outlined = applyBoxStyle(original, { pointOutline: true });
  expect(boxStyleDefaults(original).pointOutline).toBe(false);
  expect(boxStyleDefaults(buildBoxScatterOption({ ...model, layout: 'features', scatterMode: 'outliers' })).pointOutline).toBe(true);
  expect(outlined.series[0]).toBe(original.series[0]);
  expect(outlined.series[1].data).toBe(original.series[1].data);
  expect(outlined.series[1].itemStyle).toEqual({ ...original.series[1].itemStyle, borderColor: '#404040', borderWidth: 1.2 });
  expect(applyBoxStyle(original, { pointOutline: false }).series[1].itemStyle.borderWidth).toBe(0);
  const chart = init(null, null, { renderer: 'svg', ssr: true, width: 900, height: 430 });
  try {
    chart.setOption(outlined);
    const svg = chart.renderToSVGString();
    expect(svg).toMatch(/fill="#e74c3c"[^>]*stroke="#404040"/);
    expect(svg).toMatch(/fill="#2ecc71"[^>]*stroke="#404040"/);
    expect(svg).not.toContain('点轮廓');
  } finally { chart.dispose(); }
});
