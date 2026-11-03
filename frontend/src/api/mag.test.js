import { getMagOverview, getMagFunctions, getMagTaxonomy, magFunctionalRequest, magDownloadUrl, magParams } from './mag';
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

test('large explicit selections use a JSON body while retaining release and settings in the URL', async () => {
  const ids = Array.from({ length: 869 }, (_, i) => `CRR${i}__cleanbin_000001`).join(',');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ values: [] }) })));
  try {
    await getMagFunctions('matrix', { revision: 'pinned', magIds: ids, magLimit: 1000, featureIds: 'K00929' });
    const [url, options] = fetch.mock.calls[0];
    expect(url.length).toBeLessThan(1800);
    expect(url).toContain('/functions/query/matrix?revision=pinned');
    expect(url).toContain('magLimit=1000');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ magIds: ids, featureIds: 'K00929' });
    expect(magFunctionalRequest('download/matrix', { revision: 'pinned', magIds: ids }).post).toBe(true);
    expect(magFunctionalRequest('matrix', { magIds: 'M1,M2' }).post).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

test('taxonomy uses the MAG cold-load budget and still supports cancellation', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, json: async () => ({ totalMagCount: 872 }) }), 20_000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); });
  })));
  try {
    const result = getMagTaxonomy({ rank: 'phylum' });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toEqual({ totalMagCount: 872 });
    const controller = new AbortController();
    const cancelled = getMagTaxonomy({}, { signal: controller.signal }); controller.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' });
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});
