import { vi } from 'vitest';
import { createApiProxy, DEFAULT_API_PROXY_TARGET, resolveApiProxyTarget } from '../../scripts/api-proxy.mjs';

test('uses the canonical API target unless explicitly configured', () => {
  expect(resolveApiProxyTarget()).toBe(DEFAULT_API_PROXY_TARGET);
  expect(resolveApiProxyTarget({}, { VITE_API_PROXY_TARGET: 'http://localhost:18000/' })).toBe('http://localhost:18000');
  expect(resolveApiProxyTarget({ VITE_API_PROXY_TARGET: 'http://localhost:18001' }, { VITE_API_PROXY_TARGET: 'http://localhost:18000' })).toBe('http://localhost:18001');
  expect(() => resolveApiProxyTarget({ VITE_API_PROXY_TARGET: 'file:///tmp/api' })).toThrow('HTTP or HTTPS');
});

function errorHandler() {
  const proxy = { on: vi.fn() };
  createApiProxy(DEFAULT_API_PROXY_TARGET)['/api'].configure(proxy);
  return proxy.on.mock.calls[0][1];
}

test('an unavailable upstream returns a structured non-cacheable 503', () => {
  const response = { writeHead: vi.fn(), end: vi.fn() };
  errorHandler()(new Error('ECONNREFUSED'), {}, response);
  expect(response.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({ code: 'API_UPSTREAM_UNAVAILABLE', detail: expect.stringContaining('后端服务') });
});

test.each(['headersSent', 'writableEnded', 'destroyed'])('does not overwrite a %s response', flag => {
  const response = { [flag]: true, writeHead: vi.fn(), end: vi.fn() };
  errorHandler()(new Error('connection lost'), {}, response);
  expect(response.end).not.toHaveBeenCalled();
});

test('handles startup or socket errors without an HTTP response', () => {
  expect(() => errorHandler()(new Error('connection lost'), {}, undefined)).not.toThrow();
  expect(() => errorHandler()(new Error('connection lost'), {}, {})).not.toThrow();
});
