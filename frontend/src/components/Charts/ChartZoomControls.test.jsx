import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ChartZoomControls from './ChartZoomControls';

const props = () => ({ scale: .05, minScale: .02, maxScale: 8, fitMode: 'fit', onFit: vi.fn(), onWidth: vi.fn(), onZoom: vi.fn(), onSlide: vi.fn() });
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

test('slider uses proportional magnification across the full range and accepts keyboard input', () => {
  const controls = props();
  render(<ChartZoomControls {...controls} />);
  const slider = screen.getByRole('slider', { name: '缩放滑动条' });
  expect(slider).toHaveAttribute('aria-valuetext', '5%');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  const [next] = controls.onSlide.mock.lastCall;
  expect(next).toBeGreaterThan(.05);
  expect(next).toBeLessThan(.051);
  fireEvent.keyDown(slider, { key: 'End' });
  expect(controls.onSlide.mock.lastCall[0]).toBeCloseTo(8);
  fireEvent.keyDown(slider, { key: 'Home' });
  expect(controls.onSlide.mock.lastCall[0]).toBeCloseTo(.02);
});

test('precise percentage edits commit on blur, while Escape and invalid edits preserve the camera', () => {
  const controls = props();
  render(<ChartZoomControls {...controls} />);
  const input = screen.getByLabelText('图形缩放比例');
  act(() => input.focus());
  fireEvent.change(input, { target: { value: '41.6' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(controls.onZoom.mock.lastCall[0]).toBeCloseTo(.416);
  controls.onZoom.mockClear();
  act(() => input.focus());
  fireEvent.change(input, { target: { value: '200' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(controls.onZoom).not.toHaveBeenCalled();
  act(() => input.focus());
  fireEvent.change(input, { target: { value: 'abc' } });
  fireEvent.blur(input);
  expect(controls.onZoom).not.toHaveBeenCalled();
  expect(input).toHaveValue('5');
});

test('fit choices and small zoom steps have separate actions and boundary states', () => {
  const controls = { ...props(), scale: .02 };
  render(<ChartZoomControls {...controls} />);
  expect(screen.getByRole('button', { name: '适应视口' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '缩小图形' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '适应宽度' }));
  expect(controls.onWidth).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }));
  expect(controls.onZoom).toHaveBeenLastCalledWith(1);
  fireEvent.click(screen.getByRole('button', { name: '放大图形' }));
  expect(controls.onZoom.mock.lastCall[0]).toBeCloseTo(.023);
});
