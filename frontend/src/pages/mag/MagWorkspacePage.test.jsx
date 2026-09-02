import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import * as api from '../../api/mag';
import MagWorkspacePage from './MagWorkspacePage';

vi.mock('../../api/mag', async importOriginal => ({ ...await importOriginal(),
  getMagOverview: vi.fn(), getMagFeatures: vi.fn(), getMagDistribution: vi.fn(), getMagHeatmap: vi.fn(), getMagSamples: vi.fn(),
  getMagTaxonomy: vi.fn(), getMagQuality: vi.fn(),
}));
vi.mock('./MagCharts', () => ({ default: ({ view }) => <div data-testid={`chart-${view}`} /> }));

const audit = { version: 'mag_v2', analysisVersion: 'v2', dataFingerprint: 'sha123', requestFingerprint: 'scope123', sampleCount: 185,
  groupCounts: { AD: 122, NC: 63 }, magCount: 872, testedFeatureCount: 872, filters: { abundanceThresholdPercent: 0 }, sampleIds: ['CRR1'], sources: [], warnings: [] };
const item = { magId: 'MAG_A', lengthBp: 1000, adMeanPercent: 2, ncMeanPercent: 1, qValue: 0.1 };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMagOverview.mockImplementation(async scope => ({ provenance: { ...audit, sampleCount: scope.ageMin === '120' ? 0 : 185 },
    batches: [], capabilities: { taxonomy: true, quality: true }, options: { genders: ['F', 'M'], batches: ['1', '2'], ageMin: 60, ageMax: 89 } }));
  api.getMagFeatures.mockImplementation(async params => ({ provenance: audit, total: params.query ? 1 : 872, items: [{ ...item, magId: params.offset ? 'MAG_B' : 'MAG_A' }] }));
  api.getMagDistribution.mockResolvedValue({ provenance: audit, feature: item, samples: [], boxes: [] });
  api.getMagHeatmap.mockResolvedValue({ provenance: audit, magIds: ['MAG_A'], samples: [], values: [], selection: 'Top N' });
  api.getMagSamples.mockResolvedValue({ provenance: audit, items: [] });
  api.getMagTaxonomy.mockResolvedValue({ provenance: audit, rank: 'phylum', topN: 20, items: [{ label: 'Bacillota', count: 2, percent: 66.7 }], totalMagCount: 3,
    distinctTaxonCount: 2, resolvedMagCount: 3, unresolvedMagCount: 0, method: 'GTDB-Tk', version: null, versionNote: '待补' });
  api.getMagQuality.mockResolvedValue({ provenance: audit, items: [{ magId: 'MAG_A', completenessPercent: 95, contaminationPercent: 2, contigN50Bp: 500,
    genomeSizeBp: 1000, totalContigs: 10, inReferenceBand: true }], summary: { totalMagCount: 3, referenceBandCount: 2, completenessMinPercent: 80,
    completenessMaxPercent: 95, contaminationMinPercent: 2, contaminationMaxPercent: 6 }, referenceBand: { label: '参考区间（非 MIMAG 高质量判定）' }, method: 'CheckM2', version: '1.1.0' });
});

const datasets = [
  { slug: 'ad-nc-species', featureKind: 'taxonomy' },
  { slug: 'ad-nc-ko-abundance', featureKind: 'ko' },
];

function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MagWorkspacePage datasets={datasets} onDatasetChange={vi.fn()} onDomainChange={vi.fn()} {...props} /></MemoryRouter></QueryClientProvider>);
}

test('uses button-based module switching and keeps the MAG analysis navigation in sync', async () => {
  const onDatasetChange = vi.fn();
  mount({ onDatasetChange });
  await screen.findByTestId('chart-features');

  expect(screen.queryByRole('link', { name: /MAG 解析/ })).toBeNull();
  expect(screen.getByRole('button', { name: /MAG 解析/ }).getAttribute('aria-current')).toBe('page');
  const summary = screen.getByText('MAG总数').closest('.metric-grid');
  expect(summary).toBeTruthy();
  expect(within(summary).getByText('总样本数')).toBeTruthy();
  expect(within(summary).getByText('AD 组')).toBeTruthy();
  expect(within(summary).getByText('NC 组')).toBeTruthy();

  expect(document.querySelector('.app-subtitle')).toHaveTextContent('MAG 解析');
  expect(screen.getByRole('option', { name: '当前 MAG 分析结果（mag_v2）' })).toBeTruthy();
  expect(screen.getByText('结果已就绪')).toHaveClass('topbar-status');
  expect(screen.getByText('运行 185 样本 · 当前结果覆盖 185')).toHaveClass('topbar-context__scope');
  expect(screen.getByRole('checkbox', { name: '色盲友好' }).closest('label')).toHaveClass('colorblind-toggle');
  expect(screen.queryByRole('button', { name: '刷新数据' })).toBeNull();

  const navigation = screen.getByRole('navigation', { name: '图表导航' });
  expect(within(navigation).getByText('丰度分析')).toBeTruthy();
  expect(within(navigation).getByText('注释解析')).toBeTruthy();
  expect(within(navigation).getByText('质量与复现')).toBeTruthy();
  expect(within(navigation).getByText('技术质控')).toBeTruthy();
  expect(within(navigation).getByRole('button', { name: /MAG 分类/ })).not.toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /MAG 功能注释.*规划中/ })).toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /MAG 质量/ })).not.toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /跨队列复现.*规划中/ })).toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /丰度与候选列表/ })).toHaveClass('nav-item--active');
  expect(within(navigation).getByRole('button', { name: /映射与丰度阈值/ })).not.toBeDisabled();
  expect(navigation.querySelectorAll('.nav-item')).toHaveLength(8);
  expect(screen.getByText('已接入：丰度分析、MAG分类、MAG质量、技术质控')).toBeTruthy();
  expect(screen.getByText('待核验：MAG功能注释、跨队列复现')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /群落功能/ }));
  expect(onDatasetChange).toHaveBeenCalledWith('ad-nc-ko-abundance');
});

test('loads real-contract entry, pins revision, paginates and opens selected distribution', async () => {
  mount();
  await screen.findByTestId('chart-features');
  expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ revision: 'sha123', limit: 25 }), expect.anything());
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByRole('button', { name: 'MAG_B' });
  fireEvent.click(screen.getByRole('button', { name: 'MAG_B' }));
  await screen.findByTestId('chart-distribution');
  expect(api.getMagDistribution).toHaveBeenLastCalledWith('MAG_B', expect.objectContaining({ revision: 'sha123' }), expect.anything());
});

test('applies shared filters and threshold to charts and downloads, not on each keystroke', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.change(screen.getByLabelText('HPC_Batch'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('丰度阈值（%）'), { target: { value: '0.01' } });
  expect(api.getMagOverview).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenLastCalledWith(expect.objectContaining({ batch: '2', abundanceThresholdPercent: '0.01', offset: 0 }), expect.anything()));
  await screen.findByTestId('chart-features');
  expect(screen.getByRole('link', { name: '下载所选样本 × 全部 MAG' }).getAttribute('href')).toContain('abundanceThresholdPercent=0.01');
  fireEvent.click(screen.getByRole('button', { name: /样本丰度热图/ }));
  await screen.findByTestId('chart-heatmap');
  fireEvent.change(screen.getByLabelText('显示 MAG 数'), { target: { value: '50' } });
  await waitFor(() => expect(api.getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 50, batch: '2' }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: /映射与丰度阈值/ }));
  await screen.findByTestId('chart-mapping');
  fireEvent.click(screen.getByRole('button', { name: /MAG 分类/ }));
  await screen.findByTestId('chart-taxonomy');
  expect(screen.queryByLabelText('MAG 样本筛选')).toBeNull();
  expect(screen.getByRole('link', { name: '下载完整分类 CSV' }).getAttribute('href')).toContain('/downloads/taxonomy?revision=sha123');
  fireEvent.change(screen.getByLabelText('分类层级'), { target: { value: 'species' } });
  await waitFor(() => expect(api.getMagTaxonomy).toHaveBeenLastCalledWith(expect.objectContaining({ rank: 'species', topN: 20 }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: /MAG 质量/ }));
  await screen.findByTestId('chart-quality');
  expect(screen.getByText('参考区间（非 MIMAG 高质量判定）；图中阈值不替代包含 rRNA/tRNA 等条件的完整 MIMAG 质量标准。')).toBeTruthy();
  expect(screen.getByRole('link', { name: '下载完整质量 CSV' }).getAttribute('href')).toContain('/downloads/quality?revision=sha123');
});

test('search resets pagination and applies the same query to complete candidate export', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByRole('button', { name: 'MAG_B' });
  fireEvent.change(screen.getByLabelText('MAG ID 搜索'), { target: { value: 'MAG_A' } });
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
  await screen.findByRole('button', { name: 'MAG_A' });
  expect(api.getMagFeatures).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'MAG_A', offset: 0 }), expect.anything());
  expect(screen.getByRole('link', { name: '下载全部候选 CSV' }).getAttribute('href')).toContain('query=MAG_A');
});

test('empty scope is explicit and invalid age order is not submitted', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.change(screen.getByLabelText('最低年龄'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('最高年龄'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
  expect(screen.getByRole('alert').textContent).toContain('最低年龄不能大于');
  expect(api.getMagOverview).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('最高年龄'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
  await screen.findByText('当前图表暂无可展示数据');
});

test('invalid data package is shown as an error with no false chart or download', async () => {
  api.getMagOverview.mockRejectedValue(new Error('MAG 数据校验失败：请联系数据维护负责人'));
  mount();
  await screen.findByText(/MAG 数据校验失败/);
  expect(screen.queryByTestId('chart-features')).toBeNull();
  expect(screen.queryByRole('link', { name: '下载全部候选 CSV' })).toBeNull();
});
