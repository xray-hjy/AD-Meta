import { selectOption } from '../../test/selectOption';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import * as api from '../../api/mag';
import MagWorkspacePage from './MagWorkspacePage';

vi.mock('../../api/mag', async importOriginal => ({ ...await importOriginal(),
  getMagOverview: vi.fn(), getMagFeatures: vi.fn(), getMagDistribution: vi.fn(), getMagHeatmap: vi.fn(), getMagSamples: vi.fn(),
  getMagTaxonomy: vi.fn(), getMagQuality: vi.fn(), getMagLineageClusters: vi.fn(), getMagLineageCluster: vi.fn(),
  getMagLineage: vi.fn(), getMagCrosswalk: vi.fn(), getMagCatalog: vi.fn(),
}));
vi.mock('./MagCharts', () => ({ default: ({ view, data, onSelect }) => <div data-testid={`chart-${view}`} data-mag-ids={view === 'features' ? data.items.map(row => row.magId).join(',') : data.feature?.magId}>
  {view === 'features' ? <button onClick={() => onSelect(data.items[0].magId)}>查看图中 MAG</button> : null}
</div> }));
vi.mock('./MagResearchChart', () => ({ default: () => <div data-testid="lineage-scatter" /> }));

const audit = { version: 'mag_v3', analysisVersion: 'v3', dataFingerprint: 'sha123', requestFingerprint: 'scope123', sampleCount: 185,
  groupCounts: { AD: 122, NC: 63 }, magCount: 872, testedFeatureCount: 872, filters: { abundanceThresholdPercent: 0 }, sampleIds: ['CRR1'], sources: [], warnings: [] };
const item = { magId: 'MAG_A', lengthBp: 1000, adMeanPercent: 2, ncMeanPercent: 1, qValue: 0.1 };
const clusterSummary = { clusterId: '100_1', representativeMag: 'MAG_A', memberCount: 2, sourceSampleCount: 2,
  adMemberCount: 1, ncMemberCount: 1, sourceGroups: ['CHN', 'CHN2'], aniMin: 0.949, aniMax: 1,
  alignmentCoverageMin: 0.5, alignmentCoverageMax: 1, below095AniCount: 1, gtdbSpecies: 'Species A',
  completenessPercent: 95, contaminationPercent: 2, mappingStatus: 'matched_exact_ncbi_species_taxid' };
const member = { clusterId: '100_1', representativeMag: 'MAG_A', memberMag: 'MEMBER_A', isRepresentative: false,
  clusterMemberCount: 2, representativeSourceSampleId: 'CRR2', representativeSampleName: 's2', representativeSampleAccession: 'a2',
  representativeDisease: 'AD', representativeGroup: 'CHN2', representativeHpcBatch: '2', memberSourceSampleId: 'CRR1',
  memberSampleName: 's1', memberSampleAccession: 'a1', memberDisease: 'NC', memberGroup: 'CHN', memberHpcBatch: '1',
  memberToRepAni: 0.949, memberToRepAlignmentCoverage: 0.5, aniDirection: 'representative_reference__member_query',
  memberCompletenessPercent: 90, memberContaminationPercent: 3, representativeCompletenessPercent: 95,
  representativeContaminationPercent: 2, representativeScore: 85, secondaryClusterDistanceThreshold: 0.05,
  equivalentAniThreshold: 0.95, clusterMethod: 'average', comparisonAlgorithm: 'fastANI', primaryCluster: '100' };
const crosswalkItem = { magId: 'MAG_A', gtdbSpecies: 'Species A', gtdbReferenceAccession: 'GCA_1', ncbiSpeciesTaxid: '123',
  ncbiOrganismName: 'Species A', krakenSpeciesName: 'Species A', mappingStatus: 'matched_exact_ncbi_species_taxid' };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  api.getMagOverview.mockImplementation(async scope => ({ provenance: { ...audit, sampleCount: scope.ageMin === '120' ? 0 : 185 },
    batches: [], capabilities: { taxonomy: true, quality: true, lineage: true, crosswalk: true }, options: { genders: ['F', 'M'], batches: ['1', '2'], ageMin: 60, ageMax: 89 } }));
  api.getMagFeatures.mockImplementation(async params => ({ provenance: audit, total: params.query ? 1 : 872, items: [{ ...item, magId: params.offset ? 'MAG_B' : 'MAG_A' }] }));
  api.getMagDistribution.mockResolvedValue({ provenance: audit, feature: item, samples: [], boxes: [] });
  api.getMagHeatmap.mockResolvedValue({ provenance: audit, magIds: ['MAG_A'], features: [item],
    samples: [{ sampleId: 'CRR1', disease: 'AD', batch: '1' }], values: [[2]], displayValues: [[Math.log10(3)]], selection: '丰度概览',
    settings: { colorMode: 'abundance' }, warnings: [], methods: {}, constantMagIds: [],
    selectionAudit: { sourceCount: 872, matchedCount: 872, displayedCount: 1, omittedCount: 871, exclusions: [] } });
  api.getMagSamples.mockResolvedValue({ provenance: audit, items: [] });
  api.getMagTaxonomy.mockResolvedValue({ provenance: audit, rank: 'phylum', topN: 20, items: [{ label: 'Bacillota', count: 2, percent: 66.7 }], totalMagCount: 3,
    distinctTaxonCount: 2, resolvedMagCount: 3, unresolvedMagCount: 0, method: 'GTDB-Tk', version: null, versionNote: '待补' });
  api.getMagQuality.mockResolvedValue({ provenance: audit, items: [{ magId: 'MAG_A', completenessPercent: 95, contaminationPercent: 2, contigN50Bp: 500,
    genomeSizeBp: 1000, totalContigs: 10, inReferenceBand: true }], summary: { totalMagCount: 3, referenceBandCount: 2, completenessMinPercent: 80,
    completenessMaxPercent: 95, contaminationMinPercent: 2, contaminationMaxPercent: 6 }, referenceBand: { label: '参考区间（非 MIMAG 高质量判定）' }, method: 'CheckM2', version: '1.1.0' });
  api.getMagLineageClusters.mockResolvedValue({ provenance: audit, items: [clusterSummary], total: 1, limit: 300, offset: 0,
    summary: { memberMagCount: 8548, representativeMagCount: 872, secondaryClusterCount: 872, sourceSampleCount: 185, below095AniCount: 24 } });
  api.getMagLineageCluster.mockResolvedValue({ provenance: audit, cluster: clusterSummary, items: [member], total: 2, limit: 300, offset: 0 });
  api.getMagLineage.mockImplementation(async id => ({ provenance: audit, queriedMagId: id, queryRole: id === 'MEMBER_A' ? 'member' : 'representative', cluster: clusterSummary,
    member: { ...member, memberMag: id, representativeMag: id === 'MEMBER_A' ? 'MAG_A' : id }, crosswalk: crosswalkItem }));
  api.getMagCatalog.mockResolvedValue({ provenance: audit, scopeKind: 'catalog', total: 2, items: ['MAG_A', 'MAG_B'].map(magId => ({ magId,
    taxonomy: { species: 'Species A', genus: 'Genus A', phylum: 'Bacillota', closestAni: 99, closestAf: 0.8 },
    quality: { completenessPercent: 95, contaminationPercent: 2, gcContent: 0.5, contigN50Bp: 500, genomeSizeBp: 1000, totalContigs: 10 } })) });
  api.getMagCrosswalk.mockResolvedValue({ provenance: audit, items: [crosswalkItem], total: 872, limit: 300, offset: 0,
    statusCounts: { matched_exact_ncbi_species_taxid: 266, ncbi_species_taxid_not_observed_in_reads: 577, no_gtdb_reference: 29 } });
});

const datasets = [
  { slug: 'ad-nc-species', featureKind: 'taxonomy' },
  { slug: 'ad-nc-ko-abundance', featureKind: 'ko' },
];

function chooseMagCount(value) {
  fireEvent.click(screen.getByRole('button', { name: '图表显示 MAG 数' }));
  const panel = screen.getByRole('dialog');
  if (value === '0') fireEvent.click(within(panel).getByRole('button', { name: '全部匹配' }));
  else fireEvent.change(within(panel).getByRole('spinbutton', { name: '自定义 Top N' }), { target: { value } });
  fireEvent.submit(panel.querySelector('form'));
}

function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MagWorkspacePage datasets={datasets} onDatasetChange={vi.fn()} onDomainChange={vi.fn()} {...props} /></MemoryRouter></QueryClientProvider>);
}

test('keeps a collapsible data description card above the MAG processing flow', async () => {
  api.getMagOverview.mockResolvedValue({ provenance: { ...audit, sampleCount: 1, excludedSampleCount: 184, groupCounts: { AD: 1, NC: 0 } },
    batches: [], capabilities: { taxonomy: true, quality: true, lineage: true }, options: { genders: [], batches: [] } });
  const { container } = mount();
  const toggle = await screen.findByRole('button', { name: '数据说明' });
  expect(container.querySelector('.sidebar')).not.toContainElement(toggle);
  expect(container.querySelector('.dataset-description-card').nextElementSibling).toHaveClass('mag-processing');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'MAG 数据集信息' })).toBeNull();
  fireEvent.click(toggle);
  const info = screen.getByRole('region', { name: 'MAG 数据集信息' });
  expect(within(info).getByText('全量样本数').nextElementSibling).toHaveTextContent('185');
  expect(within(info).getByText('当前筛选范围').nextElementSibling).toHaveTextContent('1 个样本 · AD 1 / NC 0');
  expect(within(info).getByText('全量分组构成').nextElementSibling).toHaveTextContent('未提供全量分组记录');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'MAG 数据集信息' })).toBeNull();
});

test('all MAG selection loads the complete ranked collection independently of the result page', async () => {
  const rows = Array.from({ length: 872 }, (_, i) => ({ ...item, magId: `MAG_${i}` }));
  api.getMagFeatures.mockImplementation(async params => ({ provenance: audit, total: rows.length,
    items: rows.slice(params.offset, params.offset + params.limit) }));
  mount();
  await screen.findByTestId('chart-features');
  chooseMagCount('0');
  await waitFor(() => expect(screen.getByTestId('chart-features').dataset.magIds.split(',')).toHaveLength(872));
  expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ limit: 300, offset: 600, sortBy: 'meanPercent' }), expect.anything());
  expect(screen.getByLabelText('图表显示 MAG 数')).toHaveTextContent('全部 MAG');
  // Rendering the complete 872-row collection under CI coverage can exceed 5 seconds.
}, 15_000);

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
  expect(screen.getByRole('combobox', { name: '选择分析运行' })).toHaveTextContent('当前 MAG 分析结果（mag_v3）');
  expect(screen.getByText('结果已就绪')).toHaveClass('topbar-status');
  expect(screen.getByText('运行 185 样本 · 当前结果覆盖 185')).toHaveClass('topbar-context__scope');
  expect(screen.getByRole('checkbox', { name: '色盲友好' }).closest('label')).toHaveClass('colorblind-toggle');
  expect(screen.queryByRole('button', { name: '刷新数据' })).toBeNull();

  const navigation = screen.getByRole('navigation', { name: '图表导航' });
  expect(within(navigation).getByText('丰度分析')).toBeTruthy();
  expect(within(navigation).getByText('注释解析')).toBeTruthy();
  expect(within(navigation).getByText('质量与来源')).toBeTruthy();
  expect(within(navigation).getByText('技术质控')).toBeTruthy();
  expect(within(navigation).getByRole('button', { name: /MAG 分类/ })).not.toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /MAG 功能注释.*规划中/ })).toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /MAG 质量/ })).not.toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /来源与去冗余/ })).not.toBeDisabled();
  expect(within(navigation).getByRole('button', { name: /丰度与候选列表/ })).toHaveClass('nav-item--active');
  expect(within(navigation).getByRole('button', { name: /映射与丰度阈值/ })).not.toBeDisabled();
  expect(navigation.querySelectorAll('.nav-item')).toHaveLength(8);
  expect(screen.getByText('已接入：丰度分析、MAG分类、MAG质量、来源与去冗余、技术质控')).toBeTruthy();
  expect(screen.getByText('待核验：独立外部队列验证')).toBeTruthy();
  expect(screen.getByText('待完成：MAG功能注释')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /群落功能/ }));
  expect(onDatasetChange).toHaveBeenCalledWith('ad-nc-ko-abundance');
});

test('loads real-contract entry, pins revision, paginates and opens selected distribution', async () => {
  mount();
  await screen.findByTestId('chart-features');
  expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ revision: 'sha123', limit: 300 }), expect.anything());
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByRole('button', { name: 'MAG_B' });
  fireEvent.click(screen.getByRole('button', { name: 'MAG_B' }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByRole('button', { name: '查看分布图' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '查看分布图' }));
  await screen.findByTestId('chart-distribution');
  expect(api.getMagDistribution).toHaveBeenLastCalledWith('MAG_B', expect.objectContaining({ revision: 'sha123' }), expect.anything());
});

test('keeps chart selection independent of list pagination and sorting, with separate Top N export metadata', async () => {
  mount();
  const chart = await screen.findByTestId('chart-features');
  expect(chart).toHaveAttribute('data-mag-ids', 'MAG_A');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByRole('button', { name: 'MAG_B' });
  expect(chart).toHaveAttribute('data-mag-ids', 'MAG_A');
  selectOption(screen.getByLabelText('列表排序'), 'qValue');
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ limit: 300, offset: 0, sortBy: 'qValue', direction: 'asc' }), expect.anything()));
  expect(chart).toHaveAttribute('data-mag-ids', 'MAG_A');
  fireEvent.click(screen.getByRole('button', { name: '图表显示 MAG 数' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '自定义 Top N' }), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: '应用', exact: true }));
  selectOption(screen.getByLabelText('图表排名依据'), 'ncMeanPercent');
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0, sortBy: 'ncMeanPercent', direction: 'desc' }), expect.anything()));
  const exportLink = screen.getByRole('link', { name: '下载分析溯源 JSON' }).getAttribute('href');
  expect(exportLink).toContain('topN=50');
  expect(exportLink).toContain('chartSortBy=ncMeanPercent');
  expect(exportLink).toContain('sortBy=qValue');
});

test('pins the chosen MAG across list pagination, search and sample scope changes, and opens its source', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '查看图中 MAG' }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByRole('button', { name: '查看分布图' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '查看分布图' }));
  await screen.findByTestId('chart-distribution');
  fireEvent.click(screen.getByRole('button', { name: '候选浏览' }));
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 300 }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: '关闭MAG 候选浏览' }));
  expect(screen.getByLabelText('选择 MAG')).toHaveValue('MAG_A');
  fireEvent.change(screen.getByLabelText('MAG 搜索'), { target: { value: 'MAG_B' } });
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
  expect(screen.getByLabelText('选择 MAG')).toHaveValue('MAG_A');
  selectOption(screen.getByLabelText('HPC_Batch'), '2');
  fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
  await waitFor(() => expect(api.getMagDistribution).toHaveBeenLastCalledWith('MAG_A', expect.objectContaining({ batch: '2' }), expect.anything()));
  await screen.findByTestId('chart-distribution');
  expect(screen.getByRole('region', { name: '所选 MAG 证据摘要' })).toHaveTextContent('MAG 功能注释：待完成');
  fireEvent.click(screen.getByRole('button', { name: '查看该 MAG 来源与去冗余' }));
  await waitFor(() => expect(api.getMagLineage).toHaveBeenCalledWith('MAG_A', expect.objectContaining({ revision: 'sha123' }), expect.anything()));
  expect(await screen.findByLabelText('聚类 / 代表 MAG / GTDB 物种')).toHaveValue('MAG_A');
});

test('folds the plot and evidence together while keeping the sample list independently available', async () => {
  api.getMagDistribution.mockResolvedValue({ provenance: audit, feature: item, boxes: [],
    samples: [{ sampleId: 'CRR_SAMPLE', disease: 'AD', age: 70, gender: 'F', batch: '1', abundancePercent: 2 }] });
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '查看图中 MAG' }));
  await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByRole('button', { name: '查看分布图' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '查看分布图' }));
  const chart = await screen.findByTestId('chart-distribution');
  const evidence = screen.getByRole('region', { name: '所选 MAG 证据摘要' });
  const plotSection = chart.closest('.result-section');
  const samples = screen.getByRole('region', { name: 'MAG 样本数据' });
  expect(evidence.closest('.result-section')).toBe(plotSection);
  expect(chart.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(plotSection.compareDocumentPosition(samples.closest('.result-section')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(screen.getByRole('button', { name: '收起MAG 分布与证据' })).queryByText('MAG_A')).toBeNull();
  const identity = screen.getByRole('group', { name: '当前 MAG 标识' });
  expect(within(identity).getByRole('heading', { name: 'MAG_A' })).toBeVisible();
  expect(identity).toHaveTextContent('GTDB 分类未解析');
  expect(evidence.querySelectorAll('.mag-stat-grid > *')).toHaveLength(6);
  expect(screen.queryByLabelText('图像格式')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 分布与证据' }));
  expect(chart).not.toBeVisible();
  expect(evidence).not.toBeVisible();
  expect(identity).not.toBeVisible();
  expect(within(samples).getByText('CRR_SAMPLE')).toBeVisible();
  expect(screen.getByRole('button', { name: '查看该 MAG 来源与去冗余' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '收起样本丰度明细' }));
  expect(samples).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '展开MAG 分布与证据' }));
  expect(screen.getByTestId('chart-distribution')).toBe(chart);
  expect(screen.getByLabelText('选择 MAG')).toHaveValue('MAG_A');
  expect(evidence).toBeVisible();
  expect(samples).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '展开样本丰度明细' }));
  expect(screen.getByRole('region', { name: 'MAG 样本数据' })).toBe(samples);
  expect(samples).toBeVisible();
  expect(sessionStorage.getItem('admeta:mag:distribution:fold')).toBe('expanded');
  expect(sessionStorage.getItem('admeta:mag:distribution-samples:fold')).toBe('expanded');
});

test('folds chart and list independently without losing chart settings or the current list page', async () => {
  mount();
  await screen.findByTestId('chart-features');
  chooseMagCount('50');
  selectOption(screen.getByLabelText('列表排序'), 'qValue');
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ limit: 300, sortBy: 'qValue' }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  const row = await screen.findByRole('button', { name: 'MAG_B', exact: true });
  const chart = screen.getByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 丰度对比' }));
  expect(chart).not.toBeVisible();
  expect(row).toBeVisible();
  expect(screen.getByRole('button', { name: '展开MAG 丰度对比' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 结果列表' }));
  expect(row).not.toBeVisible();
  expect(screen.getByRole('link', { name: '下载全部候选 CSV' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '展开MAG 丰度对比' }));
  expect(screen.getByTestId('chart-features')).toBe(chart);
  expect(chart).toBeVisible();
  expect(row).not.toBeVisible();
  expect(screen.getByLabelText('图表显示 MAG 数')).toHaveTextContent('Top 50');
  expect(screen.getByLabelText('列表排序')).toHaveTextContent('BH-FDR');
  fireEvent.click(screen.getByRole('button', { name: '展开MAG 结果列表' }));
  expect(row).toBeVisible();
  expect(screen.getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page');
});

test('remembers independent folding states when returning to the MAG workspace', async () => {
  const first = mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 丰度对比' }));
  first.unmount();
  mount();
  expect(await screen.findByRole('button', { name: '展开MAG 丰度对比' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByTestId('chart-features')).toBeNull();
  expect(screen.getByRole('region', { name: 'MAG 候选列表，可横向滚动' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '展开MAG 丰度对比' }));
  expect(await screen.findByTestId('chart-features')).toBeVisible();
});

test.each(['features', 'distribution'])('keeps the %s chart visible when the candidate page fails and can retry the page', async view => {
  const normalFeatures = api.getMagFeatures.getMockImplementation();
  let failPage = true;
  api.getMagFeatures.mockImplementation(params => {
    if (params.offset && failPage) return Promise.reject(new Error('候选页暂时不可用'));
    return normalFeatures(params);
  });
  mount();
  await screen.findByTestId('chart-features');
  if (view === 'distribution') {
    fireEvent.click(screen.getByRole('button', { name: '查看图中 MAG' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: '查看分布图' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '查看分布图' }));
    await screen.findByTestId('chart-distribution');
    fireEvent.click(screen.getByRole('button', { name: '候选浏览' }));
  }
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByText('MAG 列表加载失败：候选页暂时不可用');
  expect(screen.getByTestId(`chart-${view}`)).toHaveAttribute('data-mag-ids', 'MAG_A');
  failPage = false;
  fireEvent.click(screen.getByRole('button', { name: '重试', exact: true }));
  if (view === 'features') await screen.findByRole('button', { name: 'MAG_B', exact: true });
  else await waitFor(() => expect(screen.queryByText('MAG 列表加载失败：候选页暂时不可用')).toBeNull());
  expect(screen.queryByText('MAG 列表加载失败：候选页暂时不可用')).toBeNull();
  expect(screen.getByTestId(`chart-${view}`)).toHaveAttribute('data-mag-ids', 'MAG_A');
});

test('applies shared filters and threshold to charts and downloads, not on each keystroke', async () => {
  mount();
  await screen.findByTestId('chart-features');
  selectOption(screen.getByLabelText('HPC_Batch'), '2');
  fireEvent.change(screen.getByLabelText('丰度阈值（%）'), { target: { value: '0.01' } });
  expect(api.getMagOverview).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenLastCalledWith(expect.objectContaining({ batch: '2', abundanceThresholdPercent: '0.01', offset: 0 }), expect.anything()));
  await screen.findByTestId('chart-features');
  expect(screen.getByRole('link', { name: '下载所选样本 × 全部 MAG' }).getAttribute('href')).toContain('abundanceThresholdPercent=0.01');
  fireEvent.click(screen.getByRole('button', { name: /样本丰度热图/ }));
  await screen.findByTestId('chart-heatmap');
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  fireEvent.change(screen.getByLabelText('自定义热图 MAG 数量'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: '确认数量' }));
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(api.getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 50, batch: '2' }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: /映射与丰度阈值/ }));
  await screen.findByTestId('chart-mapping');
  fireEvent.click(screen.getByRole('button', { name: /MAG 分类/ }));
  await screen.findByTestId('chart-taxonomy');
  expect(screen.queryByLabelText('MAG 样本筛选')).toBeNull();
  expect(screen.getByRole('link', { name: '下载完整分类 CSV' }).getAttribute('href')).toContain('/downloads/taxonomy?revision=sha123');
  selectOption(screen.getByLabelText('分类层级'), 'species');
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
  fireEvent.change(screen.getByLabelText('MAG 搜索'), { target: { value: 'MAG_A' } });
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
  await screen.findByRole('button', { name: 'MAG_A' });
  expect(api.getMagFeatures).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'MAG_A', offset: 0 }), expect.anything());
  expect(screen.getByRole('link', { name: '下载全部候选 CSV' }).getAttribute('href')).toContain('query=MAG_A');
});

test('keeps column presets local to display, remembers them, and places controls in their own sections', async () => {
  const first = mount();
  await screen.findByTestId('chart-features');
  const list = screen.getByRole('region', { name: 'MAG 候选列表，可横向滚动' });
  const section = list.closest('.result-section');
  expect(within(section).getByLabelText('列表排序')).toBeTruthy();
  expect(screen.getByLabelText('图表显示 MAG 数').closest('.result-section')).not.toBe(section);
  const exportHref = screen.getByRole('link', { name: '下载全部候选 CSV' }).getAttribute('href');
  const requests = api.getMagFeatures.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '列设置' }));
  const dialog = screen.getByRole('dialog', { name: '列表列设置' });
  fireEvent.click(within(dialog).getByRole('button', { name: '质量', exact: true }));
  expect(within(list).queryByRole('columnheader', { name: 'AD 均值 %' })).toBeNull();
  expect(within(list).getByRole('columnheader', { name: '完整度 %' })).toBeTruthy();
  expect(within(list).getAllByRole('columnheader')).toHaveLength(5);
  expect(within(list).getByRole('columnheader', { name: 'MAG ID（查看分布）' })).toHaveClass('mag-feature-table__identity');
  expect(within(dialog).getByRole('checkbox', { name: 'MAG ID 查看分布' })).toBeDisabled();
  expect(screen.getByRole('link', { name: '下载全部候选 CSV' })).toHaveAttribute('href', exportHref);
  expect(api.getMagFeatures).toHaveBeenCalledTimes(requests);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '列设置' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /列表方向：降序/ }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ limit: 300, direction: 'asc' }), expect.anything()));
  expect(screen.getByTestId('chart-features')).toHaveAttribute('data-mag-ids', 'MAG_A');
  first.unmount();
  mount();
  await screen.findByTestId('chart-features');
  expect(within(screen.getByRole('region', { name: 'MAG 候选列表，可横向滚动' })).getAllByRole('columnheader')).toHaveLength(5);
});

test('shows active classification query and clears it for both list and chart without changing Top N', async () => {
  mount();
  await screen.findByTestId('chart-features');
  chooseMagCount('50');
  fireEvent.change(screen.getByLabelText('MAG 搜索'), { target: { value: 'Roseburia' } });
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ query: 'Roseburia', limit: 50, offset: 0 }), expect.anything()));
  expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ query: 'Roseburia', limit: 300, offset: 0 }), expect.anything());
  expect(screen.getByRole('link', { name: '下载全部候选 CSV' }).getAttribute('href')).toContain('query=Roseburia');
  fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
  await waitFor(() => expect(api.getMagFeatures).toHaveBeenCalledWith(expect.objectContaining({ query: '', limit: 50, offset: 0 }), expect.anything()));
  expect(screen.getByLabelText('MAG 搜索')).toHaveValue('');
  expect(screen.getByLabelText('图表显示 MAG 数')).toHaveTextContent('Top 50');
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

test('renders paginated lineage, evidence chain and explicit crosswalk states', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: /来源与去冗余/ }));

  expect(await screen.findByText('8,548')).toBeTruthy();
  expect(screen.getByText('24')).toBeTruthy();
  expect(screen.getByText(/Group 仅为 CHN\/CHN2 来源组/)).toBeTruthy();
  expect(screen.getByRole('link', { name: '下载原始 lineage TSV' }).getAttribute('href')).toContain('revision=sha123');
  expect(screen.getByRole('link', { name: '下载原始 crosswalk TSV' }).getAttribute('href')).toContain('revision=sha123');
  expect(await screen.findByRole('button', { name: 'MEMBER_A' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'MEMBER_A' }));
  expect(await screen.findByRole('region', { name: '单 MAG 证据链' })).toHaveTextContent('实际 ANI 0.949');
  expect(screen.getByRole('region', { name: '单 MAG 证据链' })).toHaveTextContent('跨队列验证');
  expect(screen.getByRole('region', { name: 'MAG 物种 crosswalk，可横向滚动' })).toHaveTextContent('精确匹配');
  expect(api.getMagLineageClusters).toHaveBeenCalledWith(expect.objectContaining({ limit: 300, offset: 0 }), expect.anything());
  expect(api.getMagLineageCluster).toHaveBeenCalledWith('100_1', expect.objectContaining({ limit: 300 }), expect.anything());
});

test('MAG details preserve the chart and list page while distinguishing member abundance from representative abundance', async () => {
  mount();
  const chart = await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  const row = await screen.findByRole('button', { name: 'MAG_B', exact: true });
  fireEvent.click(row);
  const drawer = await screen.findByRole('dialog');
  await waitFor(() => expect(api.getMagDistribution).toHaveBeenCalledWith('MAG_B', expect.anything(), expect.anything()));
  fireEvent.click(within(drawer).getByRole('tab', { name: '分类证据' }));
  expect(await within(drawer).findByText('最近参考', { exact: true })).toBeTruthy();
  fireEvent.click(within(drawer).getByRole('button', { name: '关闭 MAG 详情' }));
  expect(screen.getByTestId('chart-features')).toBe(chart);
  expect(screen.getByRole('button', { name: 'MAG_B', exact: true })).toBe(row);
  expect(screen.getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page');

  fireEvent.click(screen.getByRole('button', { name: /来源与去冗余/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'MEMBER_A', exact: true }));
  const memberDrawer = await screen.findByRole('dialog');
  expect(await within(memberDrawer).findByText(/当前成员未单独进入代表 MAG 丰度矩阵/)).toHaveTextContent('MAG_A');
  await waitFor(() => expect(api.getMagDistribution).toHaveBeenLastCalledWith('MAG_A', expect.anything(), expect.anything()));
  fireEvent.click(within(memberDrawer).getByRole('tab', { name: '质量与组装' }));
  expect(within(memberDrawer).getByText(/以下组装指标属于代表 MAG/)).toHaveTextContent('MAG_A');
});

test('research expansion templates explicitly identify missing inputs without presenting completed results', async () => {
  mount();
  await screen.findByTestId('chart-features');
  fireEvent.click(screen.getByRole('button', { name: /研究拓展/ }));
  expect(screen.getAllByText('已规划，待完成', { exact: true })).toHaveLength(5);
  expect(screen.getByRole('heading', { name: '定量与检出证据' })).toBeTruthy();
  expect(screen.getByText(/样本 × MAG 的 reads 支持/)).toBeTruthy();
  expect(screen.queryByTestId('chart-features')).toBeNull();
});
