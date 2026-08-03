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

    const content = container.querySelector('.chart-frame__body');
    const audit = container.querySelector('.chart-frame__audit');

    expect(content).toContainElement(screen.getByText('Chart body'));
    expect(content).toContainElement(audit);
    expect(audit).toContainElement(screen.getByText('Audit details'));
  });
});
