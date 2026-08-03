const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  constructor(message, { kind, status = null, cause = null } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export async function fetchJson(path, {
  signal,
  timeoutMs = 15_000,
  method = 'GET',
  body,
  headers = {},
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    const requestHeaders = { ...headers };
    let requestBody = body;
    if (body != null && typeof body !== 'string' && !(body instanceof FormData)) {
      requestBody = JSON.stringify(body);
      requestHeaders['Content-Type'] ||= 'application/json';
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      body: requestBody,
      headers: requestHeaders,
      signal: controller.signal,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const kind = response.status === 404 ? 'not_found' : response.status >= 500 ? 'server' : 'request';
      throw new ApiError(payload?.detail || `请求失败: ${response.status}`, {
        kind,
        status: response.status,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(timedOut ? '请求超时，请重试' : '请求已取消', {
        kind: timedOut ? 'timeout' : 'cancelled',
        cause: error,
      });
    }
    throw new ApiError('网络连接失败，请检查服务状态', { kind: 'network', cause: error });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
