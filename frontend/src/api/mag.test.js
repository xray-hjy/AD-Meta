import { getMagOverview, magDownloadUrl, magParams } from './mag';
import { completeResultsDownloadUrl } from './completeResults';

test('encodes scope and identity, retaining zero thresholds but omitting empty filters', () => {
  const params = new URLSearchParams(magParams({ gender: '', batch: '2', abundanceThresholdPercent: 0, ageMin: null, query: 'MAG + A' }));
  expect(params.has('gender')).toBe(false);
  expect(params.get('abundanceThresholdPercent')).toBe('0');
  expect(params.get('query')).toBe('MAG + A');
  expect(magDownloadUrl('matrix', { revision: 'abc' })).toContain('/downloads/matrix?revision=abc');
});

test('complete downloads preserve filters but never page limits or offsets', () => {
  const path = completeResultsDownloadUrl('run/key', 'artifact', { query: 'AD', offset: 50, limit: 50, sortBy: 'abundance', sortDirection: 'desc' });
  expect(path).toContain('run%2Fkey');
  expect(path).toContain('/results/download?');
  expect(path).toContain('query=AD');
  expect(path).not.toContain('limit');
  expect(path).not.toContain('offset');
});

test('MAG overview waits for a cold snapshot beyond the general 15-second deadline', async () => {
  vi.useFakeTimers();
  const response = { provenance: { version: 'prjca022804-ad-nc' } };
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, json: async () => response }), 20_000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); });
  })));
  try {
    const request = getMagOverview({});
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(request).resolves.toEqual(response);
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

test('MAG initialization still respects cancellation', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })));
  try {
    const request = getMagOverview({}, { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
  } finally {
    vi.unstubAllGlobals();
  }
});
