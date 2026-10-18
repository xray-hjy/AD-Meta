import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ChartNavigationDock from './ChartNavigationDock';

let frames;
beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frames.set(++id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(key => frames.delete(key)));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
});
afterEach(() => vi.unstubAllGlobals());

const props = () => ({ world: { width: 1000, height: 1000 }, visible: { x: 100, y: 200, width: 400, height: 300 },
  viewport: { width: 400, height: 300 }, canPan: { left: true, right: true, up: true, down: true },
  panMode: true, onPan: vi.fn(), onNavigate: vi.fn(), onTogglePan: vi.fn() });

test('collapse keeps the current viewport and drag mode, hides controls, and restores focus', () => {
  const input = props();
  const parentKey = vi.fn();
  render(<div onKeyDown={parentKey}><ChartNavigationDock {...input} /></div>);
  const view = screen.getByTestId('minimap-view');
  const rectangle = ['x', 'y', 'width', 'height'].map(key => view.getAttribute(key));
  fireEvent.click(screen.getByRole('button', { name: '收起全局预览' }));
  const orb = screen.getByRole('button', { name: '展开全局预览' });
  expect(orb).toHaveFocus();
  expect(screen.queryByRole('button', { name: '图内拖动模式' })).not.toBeInTheDocument();
  expect(input.onNavigate).not.toHaveBeenCalled();
  expect(input.onPan).not.toHaveBeenCalled();
  expect(input.onTogglePan).not.toHaveBeenCalled();
  fireEvent.click(orb);
  expect(screen.getByRole('button', { name: '收起全局预览' })).toHaveFocus();
  expect(screen.getByRole('button', { name: '图内拖动模式' })).toHaveAttribute('aria-pressed', 'true');
  expect(['x', 'y', 'width', 'height'].map(key => view.getAttribute(key))).toEqual(rectangle);
  fireEvent.keyDown(screen.getByRole('button', { name: '收起全局预览' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: '展开全局预览' })).toHaveFocus();
  expect(parentKey).not.toHaveBeenCalled();
});

test('leaving during a morph cancels all pending frames; reduced motion settles immediately', () => {
  const input = props();
  const { unmount } = render(<ChartNavigationDock {...input} />);
  fireEvent.click(screen.getByRole('button', { name: '收起全局预览' }));
  expect(frames.size).toBe(1);
  unmount();
  expect(frames.size).toBe(0);
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
  render(<ChartNavigationDock {...input} />);
  act(() => fireEvent.click(screen.getByRole('button', { name: '收起全局预览' })));
  expect(frames.size).toBe(0);
  expect(document.querySelector('.chart-navigation-shell').style.width).toBe('44px');
  expect(document.querySelector('.chart-navigation-shell')).toHaveClass('is-settled-orb');
});
