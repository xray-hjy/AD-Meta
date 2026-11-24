import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { selectOption } from '../../test/selectOption';
import * as api from '../../api/mag';
import MagLineageView from './MagLineageView';
import { lineageMembersCsv } from './magLineageDownload';
import { lineageSizeOption } from './MagLineageOverview';

vi.mock('../../api/mag', async original => ({ ...await original(), getMagLineageClusters: vi.fn(), getMagLineageCluster: vi.fn(), getMagLineage: vi.fn() }));
vi.mock('../../components/Charts/CartesianEChart', () => ({ default: () => <div data-testid="size-chart" /> }));
vi.mock('./MagResearchChart', () => ({ default: ({ data, onSelect }) => <div data-testid="member-chart" data-count={data.items.length}><button onClick={() => onSelect(data.items[0].memberMag)}>点击低 ANI 点</button></div> }));
const summary = { clusterId: 'c1', representativeMag: 'rep', memberCount: 142, sourceSampleCount: 142, adMemberCount: 100, ncMemberCount: 42,
  sourceGroups: ['CHN', 'CHN2'], below095AniCount: 2 };
const items = Array.from({ length: 142 }, (_, i) => ({ memberMag: `member-${i}`, memberSourceSampleId: `s${i}`, memberDisease: 'AD', memberGroup: 'CHN',
  memberToRepAni: i < 2 ? .949000012345 : 1, memberToRepAlignmentCoverage: .3333333333333333, representativeMag: 'rep' }));
const provenance = { dataFingerprint: 'source', requestFingerprint: 'scope' };
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  api.getMagLineageClusters.mockResolvedValue({ provenance, total: 1, matchedTotal: 1, items: [summary],
    sizeDistribution: [{ id: '21+', label: '21 及以上', count: 1 }], summary: { memberMagCount: 142, secondaryClusterCount: 1, sourceSampleCount: 142, below095AniCount: 2 } });
  api.getMagLineageCluster.mockImplementation(async (_id, params) => ({ provenance, cluster: summary, total: 142,
    items: params.allMembers ? items : items.slice(params.offset, params.offset + params.limit) }));
  api.getMagLineage.mockResolvedValue(null);
});

test('size filtering resets the cluster page while member pagination never changes the whole-cluster plot', async () => {
  const onDetail = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MagLineageView overview={{ provenance, capabilities: {} }} onDetail={onDetail} /></QueryClientProvider>);
  const chart = await screen.findByTestId('member-chart'); expect(chart).toHaveAttribute('data-count', '142');
  fireEvent.click(screen.getByRole('button', { name: '21 及以上 个成员：1 簇' }));
  await waitFor(() => expect(api.getMagLineageClusters).toHaveBeenLastCalledWith(expect.objectContaining({ sizeBin: '21+', offset: 0 }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: '清除分档筛选' }));
  selectOption(screen.getByLabelText('每页成员数'), '25');
  const nav = await screen.findByRole('navigation', { name: '聚类成员分页' });
  fireEvent.click(within(nav).getByRole('button', { name: '下一页' }));
  await waitFor(() => expect(api.getMagLineageCluster).toHaveBeenLastCalledWith('c1', expect.objectContaining({ limit: 25, offset: 25 }), expect.anything()));
  expect(chart).toHaveAttribute('data-count', '142');
  expect(api.getMagLineageCluster.mock.calls.filter(([, params]) => params.allMembers)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '点击低 ANI 点' }));
  expect(onDetail).toHaveBeenCalledWith('member-0');
  expect(screen.getByRole('region', { name: '所选成员精确比对证据' })).toHaveTextContent('0.949000012345');
});

test('histogram identity, raw precision and the whole cluster survive CSV export', () => {
  const option = lineageSizeOption([{ id: '1', label: '1', count: 363 }, { id: '21+', label: '21 及以上', count: 119 }], '21+');
  expect(option.series[0].data.map(point => point.value)).toEqual([363, 119]);
  expect(option.series[0].data[1].binId).toBe('21+');
  const csv = lineageMembersCsv({ provenance, cluster: summary, items });
  expect(csv.split('\r\n')).toHaveLength(143);
  expect(csv).toContain('0.949000012345'); expect(csv).toContain('0.3333333333333333');
  expect(csv).toContain('"source","scope"');
});
