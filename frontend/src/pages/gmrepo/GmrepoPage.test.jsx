import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import * as api from '../../api/gmrepo';
import { selectOption } from '../../test/selectOption';
import GmrepoPage from './GmrepoPage';

vi.mock('../../api/gmrepo', () => ({ getGmrepoCatalog: vi.fn(), getGmrepoOverview: vi.fn(), getGmrepoGenera: vi.fn(), getGmrepoSamples: vi.fn(), getGmrepoResources: vi.fn(), resolveGmrepoSubject: vi.fn() }));
vi.mock('./ReferenceChart', () => ({ default: ({ title }) => <div role="img" aria-label={title} /> }));

const provenance = { version: 'test-v1', inputSnapshot: 'raw-v1', fingerprint: 'test-revision', processedAt: '2026-10-09', metadataTotal: 7, profileTotal: 5, genusTotal: 2, sources: [] };
const cohort = { projectId: 'PRJTEST1', metadataRuns: 7, completeProfiles: 5, groupConfirmedRuns: 3, plotReadyRuns: 2, adRuns: 1, ncRuns: 1,
  stageReferenceRuns: 1, pendingRuns: 1, noProfileRuns: 2, noResolvedGenusRuns: 2, unresolvedMedianPercent: 50, originalStudyUrl: 'https://example.org/study' };
const overview = { provenance, counts: { selectedRuns: 7, completeProfiles: 5, groupConfirmedRuns: 3, plotReadyRuns: 2, adRuns: 1, ncRuns: 1, pendingRuns: 1, noResolvedGenusRuns: 2 },
  cohorts: [cohort], decisions: [{ key: 'plot_ready', label: '属级图表可用', count: 2 }],
  missingness: [{ field: 'age', label: '年龄无精确数值', denominator: 5, unavailableCount: 4, unavailablePercent: 80, intervalCount: 1, unmappedCodeCount: 0 }], resolution: [] };
const genus = { featureId: 'NCBI:816', name: 'Bacteroides', domain: 'Bacteria', sourceTaxonIds: ['816'], sourceNames: ['Bacteroides'] };
const row = { projectId: 'PRJTEST1', runId: 'ERR1', researchGroup: 'NC', sourceGroup: 'NC', decisionKey: 'plot_ready', decisionLabel: '属级图表可用',
  ageYears: null, ageRaw: '90+', sex: 'unknown', sourceSexCode: '1', unresolvedPercent: 20, genusAbundancePercent: 0, specimenId: 's1', biosampleAccession: 'SAMN1',
  reason: '原样本疾病记录与来源标注相符。', identityNote: '独立受试者关系仍需核对。', evidenceFiles: ['evidence/source.tsv'], originalStudyUrl: 'https://example.org/study' };

beforeEach(() => {
  vi.clearAllMocks();
  api.getGmrepoCatalog.mockResolvedValue({ provenance, cohorts: [cohort], groups: [{ value: 'NC', label: 'NC' }], scopes: [{ value: 'all', label: '全部元数据' }, { value: 'plot_ready', label: '属级图表可用 AD/NC' }] });
  api.getGmrepoOverview.mockResolvedValue(overview);
  api.getGmrepoResources.mockResolvedValue({ items: [], protocol: { steps: [], selection: '不按显著性纳入', counting: '不重复计票', version: 'test' },
    discovery: { status: 'pending', note: '系统清点待完成', projects: [] }, counts: { installedProjects: 1, plotCohorts: 1, testableCohorts: 0 } });
  api.getGmrepoGenera.mockResolvedValue({ provenance, total: 1, items: [genus] });
  api.resolveGmrepoSubject.mockResolvedValue({ subjectName: 'Bacteroides uniformis', status: 'mapped', genus, reasons: [] });
  api.getGmrepoSamples.mockImplementation(async params => ({ provenance, genus: params.genus ? genus : null, total: 50, limit: 25, offset: params.offset, items: [row] }));
});

function mount(entry = '/reference/gmrepo?section=quality') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GmrepoPage /></MemoryRouter></QueryClientProvider>);
}

test('shows real scope, quality denominators, source values and traceable evidence', async () => {
  mount();
  expect(await screen.findByText('当前元数据')).toBeVisible();
  expect(screen.getByText(/Run 是测序记录/)).toBeVisible();
  expect(screen.getByText(/版本总计 7 Run/)).toBeVisible();
  expect(screen.getByText(/年龄无精确数值：4 \/ 5/)).toBeVisible();
  expect(await screen.findByText('90+')).toBeVisible();
  expect(screen.getByText('原码 1，未解码')).toBeVisible();
  fireEvent.click(screen.getByText('查看依据'));
  expect(screen.getByText('独立受试者关系仍需核对。')).toBeVisible();
  expect(screen.getByText('evidence/source.tsv')).toBeVisible();
});

test('filter and genus changes reset pagination and preserve the version in both requests', async () => {
  mount('/reference/gmrepo?page=2');
  await screen.findByText('当前元数据');
  await waitFor(() => expect(api.getGmrepoSamples).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }), expect.anything()));
  selectOption(screen.getByRole('combobox', { name: '研究队列' }), 'PRJTEST1');
  await waitFor(() => expect(api.getGmrepoOverview).toHaveBeenCalledWith(expect.objectContaining({ cohort: 'PRJTEST1', revision: 'test-revision' }), expect.anything()));
  await waitFor(() => expect(api.getGmrepoSamples).toHaveBeenCalledWith(expect.objectContaining({ cohort: 'PRJTEST1', offset: 0 }), expect.anything()));
  selectOption(screen.getByRole('combobox', { name: '菌属丰度列' }), 'NCBI:816');
  expect(await screen.findByRole('columnheader', { name: '菌属丰度（%）' })).toBeVisible();
  expect(screen.getByText(/选择菌属只增加丰度列/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重置筛选' }));
  await waitFor(() => expect(api.getGmrepoSamples).toHaveBeenLastCalledWith(expect.objectContaining({ cohort: '', genus: '', offset: 0 }), expect.anything()));
});

test('displays dataset unavailability and offers retry without demo data', async () => {
  api.getGmrepoCatalog.mockRejectedValue(new Error('GMrepo 数据完整性校验失败。'));
  mount();
  expect(await screen.findByText('参考数据暂不可用')).toBeVisible();
  expect(screen.getByText('GMrepo 数据完整性校验失败。')).toBeVisible();
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
  expect(screen.queryByText('当前元数据')).not.toBeInTheDocument();
});

test('empty selections keep the quality denominator unavailable', async () => {
  api.getGmrepoOverview.mockResolvedValue({ ...overview, counts: { ...overview.counts, selectedRuns: 0, completeProfiles: 0 }, cohorts: [],
    missingness: [{ ...overview.missingness[0], denominator: 0, unavailableCount: 0, unavailablePercent: null, intervalCount: 0 }] });
  api.getGmrepoSamples.mockResolvedValue({ provenance, total: 0, items: [], genus: null });
  mount();
  await screen.findByText('当前元数据');
  fireEvent.click(screen.getByText('各队列覆盖明细'));
  expect(await screen.findByText('当前筛选没有对应队列。')).toBeVisible();
  expect(screen.getByText(/年龄无精确数值：0 \/ 0（—）/)).toBeVisible();
  expect(await screen.findByText(/当前筛选没有样本记录/)).toBeVisible();
});

test('the default resource view is a searchable study directory, with quality and methods separate', async () => {
  api.getGmrepoResources.mockResolvedValue({ items: [{ ...cohort, researchGroups: ['AD', 'NC'], platform: '16S 属级参考',
    unadjustedStatus: 'eligible', libraryStrategies: ['AMPLICON'], sourceExperimentTypes: ['Amplicon'], evidenceFiles: [], reviewNote: '身份已核对', platformReview: '保留来源原字段' }],
    protocol: { steps: [], version: 'v1' }, discovery: { projects: [], note: '来源范围说明' }, counts: { installedProjects: 1, plotCohorts: 1, testableCohorts: 1 } });
  mount('/reference/gmrepo');
  expect(await screen.findByRole('heading', { name: '研究目录', exact: true })).toBeVisible();
  expect(screen.getByRole('link', { name: '研究目录', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByText('当前元数据')).not.toBeInTheDocument();
  expect(api.getGmrepoOverview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('searchbox', { name: '检索研究项目' }), { target: { value: 'missing' } });
  expect(screen.getByText('没有匹配的研究项目。')).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: '来源与方法', exact: true }));
  expect(await screen.findByRole('heading', { name: '来源范围与接入方法' })).toBeVisible();
  expect(screen.queryByText(/科研待审与资料补交|下载科研待审包/)).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: '检索研究项目' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '数据质量', exact: true }));
  expect(await screen.findByText('当前元数据')).toBeVisible();
  expect(await screen.findByRole('img', { name: '各队列 AD/NC 可用记录' })).toBeVisible();
});

test('study details lead to the selected cohort quality and genus directory, with no automatic genus selection', async () => {
  api.getGmrepoResources.mockResolvedValue({ items: [{ ...cohort, researchGroups: ['AD', 'NC'], platform: '16S 属级参考', unadjustedStatus: 'eligible',
    libraryStrategies: ['AMPLICON'], sourceExperimentTypes: ['Amplicon'], evidenceFiles: [], reviewNote: '身份已核对', platformReview: '来源字段保留' }],
    protocol: { steps: [], version: 'v1' }, discovery: { projects: [] }, counts: { installedProjects: 1, plotCohorts: 1, testableCohorts: 1 } });
  mount('/reference/gmrepo');
  fireEvent.click(await screen.findByRole('button', { name: 'PRJTEST1', exact: true }));
  expect(screen.getByRole('heading', { name: 'PRJTEST1 · 队列详情' })).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: '选择菌属查看分布 →' }));
  expect(await screen.findByRole('heading', { name: '参考菌属目录' })).toBeVisible();
  const target = new URL(screen.getByRole('link', { name: '评估 Bacteroides' }).getAttribute('href'), 'http://local');
  expect(target.searchParams.get('analysisCohort')).toBe('PRJTEST1');
  expect(target.searchParams.get('revision')).toBe('test-revision');
  expect(api.resolveGmrepoSubject).not.toHaveBeenCalled();
});

test('resources preserve the active main subject through view changes and quality-filter resets', async () => {
  mount('/reference/gmrepo?section=quality&cohort=PRJTEST1&subjectType=species&subjectId=1937&sourceRevision=fixed-main&returnTo=%2Fanalysis%2Fabundance%3Fchart%3Dboxplot');
  await screen.findByText('Bacteroides uniformis');
  expect(screen.getByRole('region', { name: '当前研究对象' })).toHaveTextContent('Bacteroides uniformis');
  fireEvent.click(screen.getByRole('button', { name: '重置筛选' }));
  const next = new URL(screen.getByRole('link', { name: '继续对象评估 →' }).getAttribute('href'), 'http://local');
  expect(next.searchParams.get('subjectId')).toBe('1937'); expect(next.searchParams.get('sourceRevision')).toBe('fixed-main');
  expect(screen.getByRole('link', { name: '返回主分析' })).toHaveAttribute('href', '/analysis/abundance?chart=boxplot');
  fireEvent.click(screen.getByRole('link', { name: '来源与方法', exact: true }));
  expect(await screen.findByRole('heading', { name: '来源范围与接入方法' })).toBeVisible();
  expect(screen.getByRole('region', { name: '当前研究对象' })).toHaveTextContent('Bacteroides uniformis');
});

test('discovered-only projects have a first-class destination without invented local sample counts', async () => {
  api.getGmrepoResources.mockResolvedValue({ items: [], protocol: { steps: [] }, discovery: { projects: [] },
    counts: { installedProjects: 0, plotCohorts: 0, testableCohorts: 0 }, researchLedger: { records: [{ projectId: 'PRJNEW1', installed: false,
      studyId: null, fields: {}, capabilities: { unadjusted: { status: 'not_loaded' } }, blockers: [], reviews: [],
      comparison: { observationUnit: 'Run', plotReadyRuns: 0, adjustedCount: null } }] } });
  mount('/reference/gmrepo');
  fireEvent.click(await screen.findByRole('button', { name: /补充发现/ }));
  expect(screen.getByText('未接入，尚无本地分母')).toBeVisible();
  expect(screen.queryByRole('link', { name: '质量与样本 →' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'PRJNEW1', exact: true }));
  expect(screen.getByRole('heading', { name: 'PRJNEW1 · 队列详情' })).toBeVisible();
  expect(screen.getByText(/来源发现不等于已接入/)).toBeVisible();
  expect(screen.getByRole('region', { name: 'PRJNEW1 研究依据与适用范围' })).toBeVisible();
});
