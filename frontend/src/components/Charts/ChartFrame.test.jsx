import { render, screen } from '@testing-library/react';
import ChartFrame from './ChartFrame';

describe('ChartFrame', () => {
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
