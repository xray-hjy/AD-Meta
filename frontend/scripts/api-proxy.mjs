export const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:8000';

// Process overrides and Vite .env files use the same precedence. Never silently
// substitute a temporary QA server or another database when the target is down.
export function resolveApiProxyTarget(processEnv = {}, fileEnv = {}) {
  const value = processEnv.VITE_API_PROXY_TARGET || fileEnv.VITE_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET;
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('VITE_API_PROXY_TARGET must use HTTP or HTTPS.');
  return target.href.replace(/\/$/, '');
}

export function createApiProxy(target) {
  return { '/api': { target, changeOrigin: true, configure(proxy) {
    proxy.on('error', (_error, _request, response) => {
      if (!response || typeof response.writeHead !== 'function' || response.headersSent || response.writableEnded || response.destroyed) return;
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ code: 'API_UPSTREAM_UNAVAILABLE', detail: '无法连接后端服务，请检查后端进程及 API 代理配置后重试。' }));
    });
  } } };
}
