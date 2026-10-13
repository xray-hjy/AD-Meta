import { selectOption } from '../../test/selectOption';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import EChartBase from './EChartBase';
import ChartFrame from './ChartFrame';
import CollapsibleResultSection from '../data-display/CollapsibleResultSection';

let lastOption;
vi.mock('echarts-for-react/lib/core', () => ({ default: ({ option }) => {
  lastOption = option;
  return <div data-testid="echart" />;
} }));

const option = { animation: false, legend: { data: ['AD', 'NC'] },
  xAxis: { type: 'value' }, yAxis: { type: 'category', data: ['A'] },
  series: [{ type: 'bar', barWidth: 11, itemStyle: { borderRadius: [0, 6, 6, 0] }, label: { show: true }, data: [1.234] }] };
beforeEach(() => localStorage.clear());

test('style controls are outside the image and reset restores chart defaults', () => {
  render(<EChartBase option={option} showDataTable={false} barStyleConfig={{ key: 'mag-test', suffix: '%' }} />);
  const toolbar = screen.getByRole('group', { name: '图形样式', exact: true });
  expect(screen.getByRole('img')).not.toContainElement(toolbar);
  fireEvent.click(screen.getByRole('switch', { name: '圆角' }));
  expect(lastOption.series[0].data[0].itemStyle.borderRadius).toBe(0);
  fireEvent.click(screen.getByRole('switch', { name: '数值' }));
  expect(lastOption.series[0].label.show).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  expect(screen.getByLabelText('小数位')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重置图形样式' }));
  expect(lastOption.series[0].data).toEqual([1.234]);
  expect(lastOption.series[0].label.show).toBe(true);
  expect(localStorage.getItem('admeta.chart-style.v1.mag-test')).toBeNull();
});

test('preferences survive remount, are independent between charts, and keep percent units', () => {
  const { unmount } = render(<EChartBase option={option} showDataTable={false} barStyleConfig={{ key: 'phylum-test', scale: 100, suffix: '%' }} />);
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  selectOption(screen.getByLabelText('小数位'), '2');
  expect(lastOption.series[0].label.formatter({ value: 0.123456 })).toBe('12.35%');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: '更多图形样式设置' })).toBeNull();
  expect(screen.getByRole('button', { name: '更多设置' })).toHaveFocus();
  unmount();
  const second = render(<EChartBase option={option} showDataTable={false} barStyleConfig={{ key: 'phylum-test', scale: 100, suffix: '%' }} />);
  expect(lastOption.series[0].label.formatter({ value: 0.123456 })).toBe('12.35%');
  second.rerender(<EChartBase option={option} showDataTable={false} barStyleConfig={{ key: 'mag-test' }} />);
  expect(lastOption.series[0].label.formatter).toBeUndefined();
});

test('single-series count charts omit legend and precision; other chart types have no toolbar', () => {
  const { rerender } = render(<EChartBase option={{ ...option, legend: undefined }} showDataTable={false}
    barStyleConfig={{ key: 'taxonomy-test', integerValues: true }} />);
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  expect(screen.queryByRole('switch', { name: '图例' })).toBeNull();
  expect(screen.queryByLabelText('小数位')).toBeNull();
  rerender(<EChartBase option={{ series: [{ type: 'scatter', data: [[1, 2]] }] }} showDataTable={false} />);
  expect(screen.queryByRole('group', { name: '图形样式', exact: true })).toBeNull();
});

test('frame hosts style controls beside chart actions and hides them for line view', () => {
  const withModes = { ...option, toolbox: { feature: { magicType: { type: ['line', 'bar'] } } } };
  const { container } = render(<ChartFrame title="丰度对比"><EChartBase option={withModes}
    frameActions showDataTable={false} barStyleConfig={{ key: 'frame-test' }} /></ChartFrame>);
  const toolbar = screen.getByRole('group', { name: '图形样式', exact: true });
  expect(container.querySelector('.chart-frame__context-bar')).toContainElement(toolbar);
  expect(container.querySelector('.chart-frame__body')).not.toContainElement(toolbar);
  fireEvent.click(screen.getByRole('switch', { name: '圆角' }));
  expect(lastOption.series[0].data[0].itemStyle.borderRadius).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: '切换为折线图' }));
  expect(screen.queryByRole('group', { name: '图形样式', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '切换为柱状图' }));
  expect(screen.getByRole('switch', { name: '圆角' })).toHaveAttribute('aria-checked', 'false');
});

test('nested MAG section owns its toolbar and folding hides controls without losing edits', () => {
  const { container } = render(<ChartFrame title="MAG"><CollapsibleResultSection title="MAG 丰度对比">
    <EChartBase option={option} frameActions showDataTable={false} barStyleConfig={{ key: 'fold-test' }} />
  </CollapsibleResultSection></ChartFrame>);
  const toolbar = screen.getByRole('group', { name: '图形样式', exact: true });
  expect(container.querySelector('.result-section__bar')).toContainElement(toolbar);
  expect(container.querySelector('.result-section__body')).not.toContainElement(toolbar);
  fireEvent.click(screen.getByRole('switch', { name: '数值' }));
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 丰度对比' }));
  expect(screen.queryByRole('group', { name: '图形样式', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '展开MAG 丰度对比' }));
  expect(screen.getByRole('switch', { name: '数值' })).toHaveAttribute('aria-checked', 'false');
});

test('box toolbar uses the shared header, disables hidden-point settings and resets annotations', () => {
  const boxOption = { ...option, series: [{ name: 'AD', type: 'boxplot', data: [[0, 1, 2, 3, 4]] },
    { type: 'scatter', symbolSize: 6, data: [{ value: ['A', 0], sample: 'zero-sample' }] }] };
  const { container } = render(<ChartFrame title="箱线图"><EChartBase option={boxOption} frameActions
    boxStyleConfig={{ key: 'box-test', pointLabel: '样本点', formatValue: value => `${value}%` }} /></ChartFrame>);
  expect(container.querySelector('.chart-frame__context-bar')).toContainElement(screen.getByRole('group', { name: '图形样式', exact: true }));
  fireEvent.click(screen.getByRole('switch', { name: '点轮廓' }));
  expect(lastOption.series[1].itemStyle).toMatchObject({ borderColor: '#404040', borderWidth: 1.2 });
  expect(JSON.parse(localStorage.getItem('admeta.chart-style.v1.box-test')).pointOutline).toBe(true);
  fireEvent.click(screen.getByRole('switch', { name: '样本点' }));
  expect(lastOption.series[1].symbolSize).toBe(0);
  expect(lastOption.series[1].data[0].sample).toBe('zero-sample');
  expect(screen.getByRole('switch', { name: '点轮廓' })).toBeDisabled();
  fireEvent.click(screen.getByRole('switch', { name: '样本点' }));
  expect(screen.getByRole('switch', { name: '点轮廓' })).toHaveAttribute('aria-checked', 'true');
  expect(lastOption.series[1].itemStyle.borderWidth).toBe(1.2);
  fireEvent.click(screen.getByRole('switch', { name: '样本点' }));
  fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
  expect(screen.getByLabelText('点大小')).toBeDisabled();
  expect(screen.getByLabelText('点透明度')).toBeDisabled();
  fireEvent.click(screen.getByRole('switch', { name: '中位数值' }));
  expect(lastOption.series[2].type).toBe('custom');
  fireEvent.click(screen.getByRole('button', { name: '重置图形样式' }));
  expect(lastOption.series).toEqual(boxOption.series);
  expect(localStorage.getItem('admeta.chart-style.v1.box-test')).toBeNull();
});
