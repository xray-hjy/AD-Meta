import { vi } from 'vitest';
import { getMagFeatures } from '../../api/mag';
import { getMagComparisonSelection } from './magComparisonSelection';

vi.mock('../../api/mag', () => ({ getMagFeatures: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
test('all selection combines every ranked page and carries search, scope and cancellation', async () => {
  const items = Array.from({ length: 872 }, (_, i) => ({ magId: `MAG_${i}` }));
  getMagFeatures.mockImplementation(async params => ({ items: items.slice(params.offset, params.offset + params.limit), total: 872,
    provenance: { dataFingerprint: 'fixed' }, sortBy: params.sortBy }));
  const options = { signal: new AbortController().signal };
  const result = await getMagComparisonSelection({ limit: 0, query: 'MAG', sortBy: 'adMeanPercent', gender: 'F', revision: 'fixed' }, options);
  expect(result.items).toEqual(items);
  expect(getMagFeatures).toHaveBeenCalledTimes(3);
  for (const [params, passedOptions] of getMagFeatures.mock.calls) {
    expect(params).toMatchObject({ limit: 300, query: 'MAG', sortBy: 'adMeanPercent', gender: 'F', revision: 'fixed' });
    expect(passedOptions).toBe(options);
  }
});
test('a truncated all selection reports an error rather than silently showing a partial chart', async () => {
  getMagFeatures.mockResolvedValue({ items: [{ magId: 'MAG_A' }], total: 872, provenance: { dataFingerprint: 'fixed' } });
  await expect(getMagComparisonSelection({ limit: 0 })).rejects.toThrow('未完整读取');
});

test('custom Top N above the page limit returns exactly the requested ranked collection', async () => {
  const items = Array.from({ length: 872 }, (_, i) => ({ magId: `MAG_${i}` }));
  getMagFeatures.mockImplementation(async params => ({ items: items.slice(params.offset, params.offset + params.limit), total: items.length,
    provenance: { dataFingerprint: 'fixed' } }));
  const result = await getMagComparisonSelection({ limit: 365, query: 'MAG', sortBy: 'ncMeanPercent' });
  expect(result.items).toEqual(items.slice(0, 365));
  expect(result.total).toBe(872);
  expect(getMagFeatures.mock.calls.map(([params]) => [params.offset, params.limit])).toEqual([[0, 300], [300, 65]]);
});
