import { describe, expect, it } from 'vitest';
import * as echarts from 'echarts/core';
import { CustomChart, HeatmapChart, ScatterChart } from 'echarts/charts';
import { GridComponent, VisualMapComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { setPlatformAPI } from 'zrender/lib/core/platform';
import { functionMatrixOption, geneTrackOption, phylogenyTrackOption, coverageSensitivityOption } from './magFunctionOptions';
import { functionalMatrixGeometry, phylogenyHeight } from './magFunctionalGeometry';

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

  it('keeps quality tracks narrow and outside feature columns', () => {
    const chart = functionMatrixOption(matrix, { annotations: true });
    expect(chart.xAxis.data).toEqual(['K00929', 'K01580']);
    expect(chart.series[2].data.map(r => r.trackIndex)).toEqual([0, 1, 0, 1]);
    expect(functionalMatrixGeometry(872, 2)).toMatchObject({ cellWidth: 64, cellHeight: 24, viewportHeight: 760 });
    expect(functionalMatrixGeometry(3, 2).viewportHeight).toBe(280);
  });

  it('adapts small trees and gives large trees an aligned readable initial leaf window', () => {
    expect(phylogenyHeight(3)).toBe(240);
    expect(phylogenyHeight(869)).toBe(740);
    const children = Array.from({ length: 869 }, (_, i) => ({ name: `M${i}`, branchLength: i / 10 }));
    const chart = phylogenyTrackOption({ tree: { children } }, matrix, {}, 'length');
    expect(chart.series[1].data).toHaveLength(869);
    expect(chart.series[1].data[868].value[0]).toBe(86.8);
    expect(chart.dataZoom[0].endValue).toBe(23.5);
    expect(chart.dataZoom[0].yAxisIndex).toEqual([0, 1]);
    const short = phylogenyTrackOption({ tree: { children: [{ name: 'M1', branchLength: .02 }, { name: 'M2', branchLength: .01 }] } }, matrix, {}, 'length');
    expect(short.xAxis[0].max).toBe(.02);
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
