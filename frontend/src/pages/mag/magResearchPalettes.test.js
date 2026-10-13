import { describe, expect, it } from 'vitest';
import { researchPaletteOptions, resolveResearchPalette } from './magResearchPalettes';
import { decorateResearchOption, researchFields } from './magResearchStyle';

const scatter = { xAxis: {}, yAxis: {}, tooltip: {}, series: [
  { type: 'scatter', data: [{ name: 'M1' }], symbol: 'circle', markArea: { itemStyle: { color: '#368a8910' }, data: [[{ xAxis: 90 }, { xAxis: 100 }]] } },
  { type: 'scatter', data: [{ name: 'M2' }], symbol: 'emptyCircle' },
] };

describe('publication research palettes', () => {
  it('uses exactly two swatches for every quality scheme and the same colours in both series and reference area', () => {
    const schemes = researchFields('quality')[0].options;
    expect(schemes.length).toBeGreaterThanOrEqual(10);
    for (const scheme of schemes) {
      expect(scheme.colors).toHaveLength(2);
      expect(new Set(scheme.colors).size).toBe(2);
      const option = decorateResearchOption(scatter, 'quality', { palette: scheme.value });
      expect(option.color).toEqual(scheme.colors);
      expect(option.series.map(series => series.itemStyle.color)).toEqual(scheme.colors);
      expect(option.series.map(series => series.itemStyle.borderColor)).toEqual(scheme.colors);
      expect(option.series.map(series => series.symbol)).toEqual(['circle', 'emptyCircle']);
      expect(option.series[0].markArea.itemStyle.color).toBe(`${scheme.colors[0]}10`);
      expect(scatter.series[0].markArea.itemStyle.color).toBe('#368a8910');
      expect(scheme.source).toMatch(/^https:\/\//);
    }
  });
  it('retains original multi-category palettes and defaults to twelve unique colours for the taxonomy panel', () => {
    const schemes = researchPaletteOptions('taxonomy');
    expect(schemes.find(p => p.value === 'npg').colors).toHaveLength(10);
    expect(schemes.find(p => p.value === 'd3-category20').colors).toHaveLength(20);
    expect(schemes.some(p => p.value === 'tol-high-contrast')).toBe(false);
    const base = { ...scatter, series: [{ type: 'bar', data: Array.from({ length: 12 }, (_, index) => ({ value: index + 1, percent: index })) }] };
    const option = decorateResearchOption(base, 'taxonomy', {});
    expect(resolveResearchPalette('taxonomy').value).toBe('brewer-paired');
    expect(new Set(option.series[0].data.map(item => item.itemStyle.color)).size).toBe(12);
  });
  it('resolves legacy and invalid preferences identically for the toolbar and plot', () => {
    for (const kind of ['taxonomy', 'quality', 'mapping', 'lineage']) {
      for (const palette of ['classic', 'muted', 'accessible', 'missing']) {
        const resolved = resolveResearchPalette(kind, { palette });
        const option = decorateResearchOption(scatter, kind, { palette });
        expect(option.color).toEqual(resolved.colors);
        expect(researchFields(kind)[0].options.some(p => p.value === resolved.value)).toBe(true);
      }
    }
  });
  it('switches between binary and batch palette sizes without changing data coordinates', () => {
    const base = { ...scatter, series: Array.from({ length: 5 }, () => ({ type: 'scatter', data: [{ value: [80, 1] }] })) };
    const style = { palette: 'tol-high-contrast', groupBy: 'batch' };
    const resolved = resolveResearchPalette('mapping', style);
    expect(resolved.value).toBe('tol-bright');
    const option = decorateResearchOption(base, 'mapping', style);
    expect(new Set(option.series.map(s => s.itemStyle.color)).size).toBe(5);
    expect(option.color).toEqual(resolved.colors);
    expect(option.series[0].data[0].value).toEqual([80, 1]);
    expect(researchPaletteOptions('mapping', { groupBy: 'disease' }).every(p => p.colors.length === 2)).toBe(true);
    expect(researchPaletteOptions('lineage', { groupBy: 'source' }).every(p => p.colors.length === 2)).toBe(true);
  });
});
