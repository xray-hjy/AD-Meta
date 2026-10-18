import { vi } from 'vitest';
import { fetchJson } from './client';
import { getCompleteResults } from './completeResults';

vi.mock('./client', () => ({ fetchJson: vi.fn() }));

test('full result queries have a bounded longer timeout and preserve cancellation', () => {
  const signal = new AbortController().signal;
  getCompleteResults('run', 'matrix', { limit: 300 }, { signal });
  expect(fetchJson).toHaveBeenLastCalledWith('/api/analysis-runs/run/artifacts/matrix/results?limit=300',
    { timeoutMs: 60_000, signal });
  getCompleteResults('run', 'matrix', { limit: 1 }, { timeoutMs: 1000 });
  expect(fetchJson).toHaveBeenLastCalledWith(expect.any(String), { timeoutMs: 1000 });
});
