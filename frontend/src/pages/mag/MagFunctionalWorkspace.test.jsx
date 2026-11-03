import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { getMagFunctions } from '../../api/mag';
import MagFunctionalWorkspace from './MagFunctionalWorkspace';

vi.mock('../../api/mag', async original => ({ ...await original(), getMagFunctions: vi.fn() }));
vi.mock('./MagFunctionalChart', () => ({ default: ({ data }) => <output data-testid="functional-chart">{data.items?.length ?? data.mags?.length}</output> }));
vi.mock('./MagFunctionalSources', () => ({ default: ({ module, selection }) => <output>{module}:{selection.magLimit}</output> }));
const items = Array.from({ length: 872 }, (_, i) => ({ magId: `M${i}`, taxonomy: {}, quality: {}, label: `M${i}` }));
const overview = { provenance: { dataFingerprint: 'release', datasetKey: 'cohort', magCount: 872, groupCounts: { AD: 122, NC: 63 } }, capabilities: { metabolism: true, arg: true, bgc: true } };
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks();
  getMagFunctions.mockImplementation(async (resource, params) => {
    if (resource === 'overview') return { items, namespaces: [], report: { distill: { differingRows: 0, differingCells: 0 }, namespaces: { kofam_ko: { featureCount: 1000 } } }, themes: [] };
    if (resource === 'features') return { items: [], total: 6787 };
    return { mags: items.slice(0, params.magLimit), features: [], values: [], methods: { meaning: 'test annotation counts' }, selection: { catalogMags: 872, matchedMags: 872, matchedFeatures: 6787, shownMags: params.magLimit, shownFeatures: 0 }, theme: { label: '丁酸相关酶', description: '', definitionVersion: 'v', source: 'test' } };
  });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MagFunctionalWorkspace overview={overview} scope={{}} /></QueryClientProvider>);
}
async function choose(noun, value) {
  fireEvent.click(screen.getByRole('button', { name: `展示${noun}数量`, exact: true }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: `展示${noun}数量` }), { target: { value: String(value) } });
  fireEvent.click(within(dialog).getByRole('button', { name: '确认数量' }));
}
it('keeps the same applied MAG count in overview, themes, ARG and BGC', async () => {
  mount(); await screen.findByText('匹配功能 6787');
  await choose('MAG', 3); fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  fireEvent.click(screen.getByRole('tab', { name: '功能总览', exact: true }));
  await waitFor(() => expect(screen.getAllByTestId('functional-chart')[0]).toHaveTextContent('3'));
  fireEvent.click(screen.getByRole('tab', { name: '代谢专题', exact: true }));
  await waitFor(() => expect(getMagFunctions).toHaveBeenCalledWith('themes/butyrate', expect.objectContaining({ magLimit: 3 }), expect.anything()));
  fireEvent.click(screen.getByRole('tab', { name: 'ARG', exact: true })); expect(screen.getByText('arg:3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'BGC', exact: true })); expect(screen.getByText('bgc:3')).toBeInTheDocument();
});
it('reports an oversized projection beside the settings without submitting a failing query', async () => {
  mount(); await screen.findByText('匹配功能 6787');
  await choose('MAG', 872); await choose('功能', 200);
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  expect(screen.getByRole('alert')).toHaveTextContent('100,000');
  expect(getMagFunctions.mock.calls.some(([resource, p]) => resource === 'matrix' && p.magLimit === 872)).toBe(false);
});
