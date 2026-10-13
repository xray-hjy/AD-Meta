import { describe, expect, it } from 'vitest';
import { decorateResearchOption } from './magResearchStyle';
import { mappingResearchOption, lineageResearchOption } from './magResearchOptions';

describe('research chart semantics', () => {
  const data = { provenance: { magCount: 872 }, items: [
    { sampleId: 'A', disease: 'AD', mappedPercent: 80, unmappedPercent: 20, aboveThresholdMagCount: 872 },
    { sampleId: 'N', disease: 'NC', mappedPercent: 75, unmappedPercent: 25, aboveThresholdMagCount: 872 },
  ] };
  it('uses mapping distribution for constant threshold counts without changing mapped percentages', () => {
    const option = mappingResearchOption(data, {});
    expect(option.yAxis.name).toBe('疾病分组');
    expect(option.series[0].data[0].value[0]).toBe(80);
    expect(option.series[1].data[0].details.aboveThresholdMagCount).toBe(872);
    expect(mappingResearchOption(data, { mappingView: 'relationship' }).series[0].data[0].value).toEqual([80, 872]);
  });
  it('uses the threshold relationship when counts differ and disease colors remain stable', () => {
    const varied = { ...data, items: data.items.map((row, i) => ({ ...row, aboveThresholdMagCount: i + 1 })) };
    const option = decorateResearchOption(mappingResearchOption(varied, {}), 'mapping', { palette: 'accessible', hover: false });
    expect(option.yAxis.name).toBe('超过丰度阈值的 MAG 数');
    expect(option.series.map(s => s.itemStyle.color)).toEqual(['#0072b2', '#d55e00']);
    expect(option.tooltip.show).toBe(false);
    expect(option.series[0].emphasis.disabled).toBe(true);
  });
  it('switches mapping groups to batch without changing sample coordinates or disease evidence', () => {
    const batches = { ...data, items: data.items.map((row, index) => ({ ...row, batch: String(index + 1) })) };
    const option = mappingResearchOption(batches, { groupBy: 'batch' });
    expect(option.series.map(series => series.name)).toEqual(['Batch 1', 'Batch 2']);
    expect(option.yAxis.name).toBe('HPC 批次');
    expect(option.series[1].data[0].details.disease).toBe('NC');
    expect(option.series[1].data[0].value[0]).toBe(75);
  });
  it('changes taxonomy values to percentages while retaining count evidence in the tooltip', () => {
    const base = { xAxis: {}, yAxis: {}, tooltip: {}, series: [{ type: 'bar', data: [{ value: 3, name: 'P1', percent: 75 }] }] };
    const option = decorateResearchOption(base, 'taxonomy', { metric: 'percent' });
    expect(option.series[0].data[0].value).toBe(75);
    expect(option.tooltip.formatter({ name: 'P1', data: option.series[0].data[0], dataIndex: 0 })).toContain('3 个 MAG');
    expect(base.series[0].data[0].value).toBe(3);
  });
  it('converts ANI and alignment fractions once, preserves boundary values and distinguishes representatives', () => {
    const row = { memberMag: 'M1', memberDisease: 'AD', memberGroup: 'CHN', memberToRepAni: 0.94372, memberToRepAlignmentCoverage: 0.33043, isRepresentative: true };
    const option = lineageResearchOption({ items: [row] }, { groupBy: 'source' });
    expect(option.series[0].name).toBe('CHN');
    expect(option.series[0].data[0].value[0]).toBeCloseTo(94.372);
    expect(option.series[0].data[0].value[1]).toBeCloseTo(33.043);
    expect(option.series[0].data[0].symbol).toBe('diamond');
    expect(option.series[0].markLine.data[0].xAxis).toBe(95);
  });
});
