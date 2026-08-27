import { describe, expect, test } from 'vitest';
import { withChartExport, withExportGrid, withoutTransientInteraction } from './chartExport';

describe('chart export option contract', () => {
  test('removes transient interaction without mutating the screen option', () => {
    const source = {
      animation: true,
      toolbox: { show: true, feature: { restore: {}, saveAsImage: {} } },
      tooltip: { show: true, trigger: 'axis' },
      axisPointer: { show: true },
      brush: { toolbox: ['rect'] },
      dataZoom: [{ show: true, start: 35, end: 65, startValue: 2, endValue: 8 }],
      visualMap: { show: true, calculable: true, hoverLink: true },
      series: [{ type: 'bar', selectedMode: 'single', data: [1, 2] }],
    };

    const exported = withoutTransientInteraction(source, { fullDataZoom: true });

    expect(exported.animation).toBe(false);
    expect(exported.toolbox[0].show).toBe(false);
    expect(exported.tooltip[0].show).toBe(false);
    expect(exported.axisPointer[0].show).toBe(false);
    expect(exported.brush[0].toolbox).toEqual([]);
    expect(exported.dataZoom[0]).toMatchObject({
      show: false,
      start: 0,
      end: 100,
      disabled: true,
      brushSelect: false,
    });
    expect(exported.dataZoom[0]).not.toHaveProperty('startValue');
    expect(exported.dataZoom[0]).not.toHaveProperty('endValue');
    expect(exported.visualMap[0]).toMatchObject({ show: true, calculable: false, hoverLink: false });
    expect(exported.series[0].selectedMode).toBe(false);

    expect(source.animation).toBe(true);
    expect(source.toolbox.show).toBe(true);
    expect(source.dataZoom[0]).toMatchObject({ start: 35, end: 65, startValue: 2, endValue: 8 });
    expect(source.visualMap.calculable).toBe(true);
  });

  test('applies export-only grid overrides without changing the live layout', () => {
    const source = { grid: { left: 40, bottom: 130 } };
    const exported = withExportGrid(source, { bottom: 72 });

    expect(exported.grid).toEqual({ left: 40, bottom: 72 });
    expect(source.grid).toEqual({ left: 40, bottom: 130 });
  });

  test('keeps useful toolbox actions and replaces the native image export', () => {
    const chartRef = { current: null };
    const source = {
      toolbox: {
        right: 9,
        feature: {
          dataView: { show: true },
          restore: { show: true },
          saveAsImage: { show: true },
        },
      },
    };

    const rendered = withChartExport(source, chartRef, {
      fileName: 'test-chart',
      toolbox: { top: 12 },
    });

    expect(rendered).not.toBe(source);
    expect(rendered.toolbox.right).toBe(9);
    expect(rendered.toolbox.top).toBe(12);
    expect(rendered.toolbox.feature.dataView).toEqual({ show: true });
    expect(rendered.toolbox.feature.restore).toEqual({ show: true });
    expect(rendered.toolbox.feature.saveAsImage).toBeUndefined();
    expect(rendered.toolbox.feature.myExport).toMatchObject({ show: true, title: '导出图形' });
    expect(rendered.toolbox.feature.myExport.onclick).toEqual(expect.any(Function));
    expect(source.toolbox.feature.saveAsImage).toEqual({ show: true });
  });

  test('supports array-based grids used by multi-panel figures', () => {
    const exported = withExportGrid(
      { grid: [{ top: 10, bottom: 100 }, { top: 200, bottom: 80 }] },
      { bottom: 40 }
    );

    expect(exported.grid).toEqual([
      { top: 10, bottom: 40 },
      { top: 200, bottom: 40 },
    ]);
  });
});
