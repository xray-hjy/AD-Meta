import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { getCompleteResults } from '../../api/completeResults';
import CompleteResultsPanel from './CompleteResultsPanel';

vi.mock('../../api/completeResults', async importOriginal => ({ ...await importOriginal(), getCompleteResults: vi.fn() }));

test('lazy loads full results, paginates, resets search and exports all matching rows', async () => {
  getCompleteResults.mockImplementation(async (_run, _artifact, params) => ({
    total: params.query ? 1 : 900, columns: ['sampleCode', 'featureId', 'abundance'], datasetRevision: 'rev-a', abundanceScale: 'percent', normalization: 'none',
    items: [{ sampleCode: `sample-${params.offset}`, featureId: 'MAG1', abundance: 0 }],
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><CompleteResultsPanel runKey="r1" artifactKey="a1" /></QueryClientProvider>);
  expect(getCompleteResults).not.toHaveBeenCalled();
  const details = result.container.querySelector('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await screen.findByText('sample-0');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByText('sample-300');
  expect(getCompleteResults).toHaveBeenLastCalledWith('r1', 'a1', expect.objectContaining({ limit: 300, offset: 300 }), expect.anything());
  fireEvent.change(screen.getByLabelText('完整结果搜索'), { target: { value: 'CRR' } });
  fireEvent.click(screen.getByRole('button', { name: '查询完整结果' }));
  await waitFor(() => expect(getCompleteResults).toHaveBeenLastCalledWith('r1', 'a1', expect.objectContaining({ offset: 0, query: 'CRR' }), expect.anything()));
  await screen.findByText('sample-0');
  const href = screen.getByRole('link', { name: '下载全部匹配结果 CSV' }).getAttribute('href');
  expect(href).toContain('query=CRR');
  expect(href).not.toContain('offset');
  expect(screen.getByText(/不会补零/)).toBeTruthy();
});

test('species result rows link the exact feature, source version and artifact to external evaluation', async () => {
  getCompleteResults.mockResolvedValue({
    total: 1, featureKind: 'species', datasetSlug: 'ad-nc-species', datasetRevision: 'fixed-revision',
    columns: ['sampleCode', 'featureId', 'featureName', 'abundance'], abundanceScale: 'percent', normalization: 'none',
    items: [{ sampleCode: 'CRR1', featureId: 1937, featureName: 'Bacteroides uniformis', abundance: 0.2 }],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<MemoryRouter initialEntries={['/analysis/abundance?chart=boxplot']}>
    <QueryClientProvider client={client}><CompleteResultsPanel runKey="species-run" artifactKey="species-matrix" /></QueryClientProvider>
  </MemoryRouter>);
  const details = result.container.querySelector('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
  const link = await screen.findByRole('link', { name: '外部证据评估', exact: true });
  const params = new URL(link.getAttribute('href'), 'http://localhost').searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ subjectType: 'species', subjectId: '1937',
    sourceRevision: 'fixed-revision', datasetSlug: 'ad-nc-species', runKey: 'species-run', artifactKey: 'species-matrix',
    returnTo: '/analysis/abundance?chart=boxplot' });
  expect(JSON.parse(params.get('sourceScope')).source).toContain('单行不代表总体差异');
});
