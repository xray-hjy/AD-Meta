import { expect, test } from 'vitest';
import * as echarts from 'echarts/core';
import { CustomChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, VisualMapComponent, GraphicComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { setPlatformAPI } from 'zrender/lib/core/platform';
import { PRESENCE_PALETTES, PRESENCE_BACKGROUND, presenceCell, presenceState, functionalMatrixPreview } from './magPresencePalette';
import { functionMatrixOption } from './magFunctionOptions';

echarts.use([CustomChart, HeatmapChart, GridComponent, VisualMapComponent, GraphicComponent, TooltipComponent, SVGRenderer]);
setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });
const data = { valueKind: 'presence', namespace: 'kofam_ko', mags: [{ magId: 'M1', quality: { completenessPercent: 95, contaminationPercent: 2 } }, { magId: 'M2' }],
  features: [{ featureId: 'F1' }, { featureId: 'F2' }, { featureId: 'F3' }], values: [[0, 1, null], [5, 0, 8]] };

test('12 presets use the same geometry, distinguish raw zero from missing and keep encoding without ordinary borders', () => {
  expect(PRESENCE_PALETTES.filter(p => p.family === '浅色系')).toHaveLength(6);
  expect(PRESENCE_PALETTES.filter(p => p.family === '深色系')).toHaveLength(6);
  for (const preset of PRESENCE_PALETTES) {
    const shape = { x: 0, y: 0, width: 64, height: 21 };
    const zero = presenceCell(shape, 0, preset, false, true), missing = presenceCell(shape, null, preset, false, true), hit = presenceCell(shape, 5, preset, false, true);
    expect(zero.children[0].style.fill).toBe(PRESENCE_BACKGROUND.zero);
    expect(zero.children[1].style.lineWidth).toBe(2.4);
    expect(zero.children[1].shape.x).toBe(2.7);
    expect(zero.children[1].style.stroke).toBe(preset.zeroStroke);
    expect(missing.clipPath.shape).toEqual(shape);
    expect(missing.children[1].style.lineWidth).toBe(2.8);
    expect(missing.children[1].style.stroke).toBe(preset.stripe);
    expect(hit.children[0].style.fill).toBe(preset.states[0].style.background);
    expect(preset.states[1].style.boxShadow).toContain(preset.zeroStroke);
    expect(preset.states[2].style.background).toContain(preset.stripe);
    expect(zero.children.at(-1).emphasis.style.stroke).toBe('#e45756');
    expect(presenceCell({ ...shape, width: 32, height: 10.5 }, 0, preset).children[1].style.lineWidth).toBe(1.2);
  }
  expect(presenceState(0)).toBe('0 本次未命中'); expect(presenceState(null)).toBe('不可评价'); expect(presenceState(5)).toBe('1 命中');
});

test('all themes and transpose keep raw values, state tooltips, quality colors and exportable SVG hatches', () => {
  const original = structuredClone(data);
  const annotations = functionMatrixOption(data, { annotations: true }).series[2].data;
  for (const preset of PRESENCE_PALETTES) for (const transposed of [false, true]) {
    const option = functionMatrixOption(data, { presencePalette: preset.value, transposed, annotations: true, borders: false });
    const zero = option.series[0].data.find(p => p.id.startsWith('M1|') && p.featureId === 'F1');
    const hit = option.series[0].data.find(p => p.rawCount === 5), missing = option.series[1].data[0];
    expect(zero.value).toEqual([0, 0, 0]); expect(hit.value[2]).toBe(1);
    expect(option.tooltip.formatter({ data: zero })).toContain('仅表示本次注释未命中');
    expect(option.tooltip.formatter({ data: missing })).toContain('状态：不可评价');
    expect(option.tooltip.formatter({ data: hit })).toContain('注释基因计数：5');
    if (!transposed) expect(option.series[2].data).toEqual(annotations);
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1200, height: 600 });
    try {
      chart.setOption(option); const svg = chart.renderToSVGString();
      expect(svg).toContain(preset.stripe); expect(svg).toContain(preset.zeroStroke);
      expect(svg).toContain('不可评价'); expect(svg).toContain('clipPath');
      expect(svg).not.toMatch(/(?:x|y|width|height)="NaN"/);
    } finally { chart.dispose(); }
    const preview = decodeURIComponent(functionalMatrixPreview(data, { presencePalette: preset.value, transposed }, ['#fff', '#000']));
    expect(preview).toContain(preset.hit); expect(preview).toContain(preset.zeroStroke); expect(preview).toContain(preset.stripe); expect(preview).toContain('url(#missing)');
  }
  expect(data).toEqual(original);
  const count = functionMatrixOption({ ...data, valueKind: 'count' }, { palette: 'viridis', presencePalette: 'dark-brick' });
  expect(count.series[0].type).toBe('heatmap'); expect(count.series[0].data.find(p => p.rawCount === 5).value[2]).toBe(Math.log1p(5));
  expect(count.visualMap.type).toBe('continuous'); expect(count.graphic).toBeUndefined();
});
