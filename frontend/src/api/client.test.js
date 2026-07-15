import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, fetchJson } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchJson', () => {
  test('returns parsed JSON for successful requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    await expect(fetchJson('/api/demo')).resolves.toEqual({ ok: true });
  });

  test('classifies 404 and server responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ detail: 'missing' }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ detail: 'down' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('/api/missing')).rejects.toMatchObject({ kind: 'not_found', status: 404 });
    await expect(fetchJson('/api/down')).rejects.toMatchObject({ kind: 'server', status: 503 });
  });

  test('classifies network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(fetchJson('/api/demo')).rejects.toEqual(
      expect.objectContaining({ name: 'ApiError', kind: 'network' })
    );
  });

  test('distinguishes external cancellation', async () => {
    const external = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const pending = fetchJson('/api/demo', { signal: external.signal });
    external.abort();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
