import { fireEvent, render, screen } from '@testing-library/react';
import ChartFrame from './ChartFrame';
import ChartSupplement from './ChartSupplement';

describe('ChartFrame', () => {
  test('places scope above the card, controls in the chart header, and results outside the folded chart', () => {
    const { container } = render(<ChartFrame sectioned title="KO 丰度对比"
      controls={<button>全部样本</button>} chartControls={<select aria-label="Top N"><option>20</option></select>}
      disclosure={<p>当前范围说明</p>} audit={<details><summary>完整结果查询</summary></details>}>
      <div>柱形图</div><ChartSupplement><details><summary>查看当前展示数据</summary></details></ChartSupplement>
    </ChartFrame>);
    const scope = container.querySelector('.community-scope-card');
    const card = container.querySelector('.chart-frame');
    const section = container.querySelector('.community-chart-section');
    expect(scope.nextElementSibling).toBe(card);
    expect(card).not.toContainElement(screen.getByRole('button', { name: '全部样本' }));
    expect(section.querySelector('header')).toContainElement(screen.getByRole('combobox', { name: 'Top N' }));
    expect(section.querySelector('header')).not.toContainElement(screen.getByText('当前范围说明'));
    expect(section.querySelector('.result-section__body')).toContainElement(screen.getByText('当前范围说明'));
    expect(container.querySelector('.chart-frame__results')).toContainElement(screen.getByText('查看当前展示数据'));
    fireEvent.click(screen.getByRole('button', { name: '收起KO 丰度对比' }));
    expect(screen.getByText('柱形图')).not.toBeVisible();
    expect(screen.getByText('查看当前展示数据')).toBeVisible();
    expect(screen.getByText('完整结果查询')).toBeVisible();
  });
  test('folds the chart without unmounting it or hiding the separate result queries', () => {
    render(<ChartFrame title="物种丰度对比" collapsible audit={<div>完整结果查询</div>}><div>当前图表</div></ChartFrame>);
    const chart = screen.getByText('当前图表');
    fireEvent.click(screen.getByRole('button', { name: '收起物种丰度对比' }));
    expect(chart).not.toBeVisible();
    expect(chart).toBeInTheDocument();
    expect(screen.getByText('完整结果查询')).toBeVisible();
    expect(screen.getByRole('button', { name: '展开物种丰度对比' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: '展开物种丰度对比' }));
    expect(chart).toBeVisible();
  });
  test('keeps chart supplements inside the shared content region', () => {
    const { container } = render(
      <ChartFrame
        title="Chart"
        audit={<details><summary>Audit details</summary></details>}
      >
        <div>Chart body</div>
      </ChartFrame>,
    );

    const body = container.querySelector('.chart-frame__body');
    const content = container.querySelector('.chart-frame__content');
    const audit = container.querySelector('.chart-frame__audit');

    expect(content).toContainElement(screen.getByText('Chart body'));
    expect(body).toContainElement(content);
    expect(body).toContainElement(audit);
    expect(content.nextElementSibling).toBe(audit);
    expect(audit).toContainElement(screen.getByText('Audit details'));
  });

  test('keeps the previous chart visible when a refresh fails', () => {
    const onRetry = vi.fn();
    render(
      <ChartFrame
        title="Chart"
        refreshError="network error"
        onRetry={onRetry}
      >
        <div>Previous chart</div>
      </ChartFrame>,
    );

    expect(screen.getByText('Previous chart')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('新选择计算失败');
    screen.getByRole('button', { name: '重试' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
