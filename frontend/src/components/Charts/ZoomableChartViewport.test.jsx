import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ZoomableChartViewport from './ZoomableChartViewport';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
});
afterEach(() => vi.unstubAllGlobals());

const snapshot = () => JSON.parse(screen.getByTestId('viewport-layout').textContent);
function renderViewport() {
  return render(<ZoomableChartViewport world={{ width: 2000, height: 1000 }} insets={{ left: 95, top: 42 }}
    extraRight={56} extraBottom={84} navigationDockBottom={12} viewportHeight={650}>
    {({ plot, camera, visible }) => <output data-testid="viewport-layout">{JSON.stringify({ plot, camera, visible })}</output>}
  </ZoomableChartViewport>);
}

test('collapsing the preview expands the desktop plot and reopening restores its layout', () => {
  renderViewport();
  const before = snapshot();
  fireEvent.click(screen.getByRole('button', { name: '收起全局预览' }));
  const after = snapshot();
  expect(after.plot.width - before.plot.width).toBe(294);
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(after.visible[key]).toBeCloseTo(before.visible[key]); // Fit still shows all data.
  }
  fireEvent.click(screen.getByRole('button', { name: '展开全局预览' }));
  expect(snapshot().plot).toEqual(before.plot);
});

test('on narrow screens collapse reclaims the panel height and leaves native slider gutters', () => {
  renderViewport();
  const host = document.querySelector('.zoomable-chart__viewport');
  Object.defineProperties(host, { clientWidth: { value: 390 }, clientHeight: { value: 650 } });
  act(() => window.dispatchEvent(new Event('resize')));
  const before = snapshot();
  fireEvent.click(screen.getByRole('button', { name: '收起全局预览' }));
  const after = snapshot();
  expect(after.plot.height - before.plot.height).toBe(190);
  expect(390 - after.plot.left - after.plot.width).toBe(72);
  expect(650 - after.plot.top - after.plot.height).toBe(179);
});
