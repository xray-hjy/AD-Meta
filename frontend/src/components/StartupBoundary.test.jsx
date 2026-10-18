import { render, screen } from '@testing-library/react';
import StartupBoundary, { StartupReady } from './StartupBoundary';

afterEach(() => {
  delete window.__AD_META_STARTUP__;
  vi.restoreAllMocks();
});

test('ends bootstrap waiting after a successful React commit', () => {
  const finish = vi.fn();
  window.__AD_META_STARTUP__ = { finish };
  render(<StartupBoundary><StartupReady /><p>页面内容</p></StartupBoundary>);
  expect(screen.getByText('页面内容')).toBeVisible();
  expect(finish).toHaveBeenCalledOnce();
});

test('shows a recovery action and releases bootstrap listeners after render failure', () => {
  const finish = vi.fn();
  window.__AD_META_STARTUP__ = { finish };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenPage() { throw new Error('render failed'); }
  render(<StartupBoundary><StartupReady /><BrokenPage /></StartupBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('页面暂时无法显示');
  expect(screen.getByRole('button', { name: '刷新重试' })).toBeVisible();
  expect(finish).toHaveBeenCalledOnce();
});
