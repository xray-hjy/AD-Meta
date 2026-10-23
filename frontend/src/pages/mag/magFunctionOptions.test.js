import { describe, expect, it } from 'vitest';
import * as echarts from 'echarts/core';
import { CustomChart, HeatmapChart, ScatterChart } from 'echarts/charts';
import { GridComponent, VisualMapComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { setPlatformAPI } from 'zrender/lib/core/platform';
import { functionMatrixOption, geneTrackOption, phylogenyTrackOption, coverageSensitivityOption } from './magFunctionOptions';

const matrix = { namespace: 'kofam_ko', valueKind: 'count', mags: [{ magId: 'M1', quality: { completenessPercent: 90, contaminationPercent: 1 } }, { magId: 'M2' }],
  features: [{ featureId: 'K00929', description: 'butyrate kinase' }, { featureId: 'K01580' }], values: [[2, 0], [null, 1]] };
echarts.use([CustomChart, HeatmapChart, ScatterChart, GridComponent, VisualMapComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);
// SVG engine validation, not a font/layout benchmark; jsdom has no canvas text metrics.
setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });

describe('functional ECharts projections', () => {
  it('keeps raw values and stable identity through transpose', () => {
    const normal = functionMatrixOption(matrix, { annotations: true });
    const transposed = functionMatrixOption(matrix, { transposed: true });
    const a = normal.series[0].data.find(r => r.magId === 'M1' && r.featureId === 'K00929');
    const b = transposed.series[0].data.find(r => r.id === a.id);
    expect(a.rawCount).toBe(2);
    expect(a.value[2]).toBe(Math.log1p(2));
    expect(b.rawCount).toBe(a.rawCount);
    expect(normal.series[1].data[0].magId).toBe('M2');
    expect(normal.visualMap.seriesIndex).toBe(0);
    expect(normal.series[2].data).toHaveLength(4);
  });

  it('uses interval endpoints and retains raw reverse coordinates', () => {
    const chart = geneTrackOption([{ geneId: 'g1', contigId: 'c1', start: 100, end: 20, strand: -1 }]);
    expect(chart.series[0].encode.x).toEqual([0, 1]);
    expect(chart.dataZoom[0].filterMode).toBe('weakFilter');
    expect(chart.series[0].data[0].value).toEqual([20, 100, 0, -1]);
    expect(chart.series[0].data[0].start).toBe(100);
  });

  it('uses one leaf order for phylogeny and tracks even with reversed input rows', () => {
    const tree = { tree: { children: [{ name: 'M2', branchLength: 2 }, { name: 'M1', branchLength: 1 }] } };
    const chart = phylogenyTrackOption(tree, matrix, {}, 'length');
    const cells = chart.series.find(s => s.id === 'phylogeny-functions').data;
    expect(cells.find(r => r.magId === 'M1' && r.featureId === 'K00929').value).toEqual([2, 1, 2]);
    expect(chart.yAxis[0].min).toBe(chart.yAxis[1].min);
    expect(chart.yAxis[0].max).toBe(chart.yAxis[1].max);
    expect(chart.dataZoom[0].yAxisIndex).toEqual([0, 1]);
  });

  it('computes threshold counts including the exact boundary without altering abundance', () => {
    const chart = coverageSensitivityOption({ items: [{ disease: 'AD', coveredFraction: .5 }, { disease: 'NC', coveredFraction: 0 }] });
    expect(chart.series[0].data[50]).toEqual([50, 1]);
    expect(chart.series[0].data[51]).toEqual([51, 0]);
    expect(chart.series[1].data[0]).toEqual([0, 1]);
  });

  it('renders heatmaps, gene intervals and aligned tree tracks with the actual SVG engine', () => {
    const tree = { tree: { children: [{ name: 'M2', branchLength: 2 }, { name: 'M1', branchLength: 1 }] } };
    const clustered = { ...matrix, dendrograms: { mags: { leafIds: ['M1', 'M2'], merges: [{ left: 0, right: 1, distance: 1, size: 2 }] } } };
    const options = [functionMatrixOption(clustered, {}), geneTrackOption([{ geneId: 'g1', contigId: 'c1', start: 100, end: 20, strand: -1 }]), phylogenyTrackOption(tree, matrix)];
    for (const option of options) {
      const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1200, height: 600 });
      try {
        chart.setOption(option);
        const svg = chart.renderToSVGString();
        expect(svg).toContain('<svg');
        expect(svg).not.toMatch(/(?:x|y|width|height)="NaN"/);
      } finally { chart.dispose(); }
    }
  });
});
