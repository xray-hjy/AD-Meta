import { magDownloadUrl, magParams } from './mag';
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
