import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { vi } from 'vitest';
import * as api from '../../api/gmrepo';
import { selectOption } from '../../test/selectOption';
import GenusWorkspace from './GenusWorkspace';

vi.mock('../../api/gmrepo', () => ({ getGmrepoAudit: vi.fn(), getGmrepoDistribution: vi.fn(), getGmrepoStatistics: vi.fn(), getGmrepoEvidence: vi.fn() }));
vi.mock('./GenusDistributionChart', () => ({ default: ({ data, transform }) => <div role="img" aria-label={`${data.genus.name} ${transform} AD/NC 分布`} /> }));

const genus = { name: 'Bacteroides', featureId: 'NCBI:816', domain: 'Bacteria', sourceNames: ['Bacteroides'], sourceTaxonIds: ['816'] };
const audit = { projectId: 'PRJTEST1', metadataRuns: 50, plotReadyRuns: 50, groupConfirmedRuns: 50, excludedNoGenusRuns: 0,
  knownParticipantRuns: 50, uniqueKnownParticipants: 50, repeatedParticipantIds: 0, groupCounts: { AD: 25, NC: 25 },
  unadjustedStatus: 'eligible', adjustedStatus: 'eligible', adjustedCount: 48, excludedMissingCovariates: 2, reviewNote: '公开身份审查已完成。',
  unadjustedReasons: [], adjustedReasons: [], sourceUrl: 'https://example.org/source', sexMode: 'decoded', evidenceFiles: ['identity.tsv'], design: {},
  covariates: [{ group: 'AD', count: 25, ageKnown: 24, ageMedian: 70, ageIntervalCount: 1, sexKnown: 25, sexCategories: { female: 20, male: 5 }, adjustedCount: 24 }] };
const pendingAudit = { ...audit, projectId: 'PRJTEST2', knownParticipantRuns: 0, uniqueKnownParticipants: 0, unadjustedStatus: 'blocked', adjustedStatus: 'blocked',
  unadjustedReasons: ['独立参与者编号尚未核实。'], adjustedReasons: ['独立参与者编号尚未核实。'] };
const methods = { unadjusted: '双侧 Mann–Whitney U。', adjusted: 'HC3 百分位秩模型。', fdr: '完整 322 属族统一校正。', limits: ['仅为研究线索。'], sources: [] };
const statistic = { genus, adMedianPercent: .002, ncMedianPercent: 0, adDetectedPercent: 80, ncDetectedPercent: 40,
  rankBiserial: .4, pValue: .003, qValue: .12, signalStatus: 'not_fdr_supported', adjusted: { effect: 4, ciLow: -2, ciHigh: 10, pValue: .2, qValue: .6 } };

beforeEach(() => {
  vi.clearAllMocks();
  api.getGmrepoAudit.mockResolvedValue({ items: [audit, pendingAudit], methods });
  api.getGmrepoDistribution.mockImplementation(async params => ({ cohort: params.cohort, genus, audit: params.cohort === 'PRJTEST2' ? pendingAudit : audit,
    boxes: [{ group: 'AD', count: 25, detectedCount: 20, box: [0, 0, .002, .01, 1] }, { group: 'NC', count: 25, detectedCount: 10, box: [0, 0, 0, .001, .1] }],
    points: [{ group: 'NC', runId: 'ERRZERO', participantId: 'p1', value: 0, unresolvedPercent: 35, sex: 'unknown', sourceSexCode: '1', ageRaw: '90+', readCount: 1000, qcStatus: '1' }], note: '零值与离群点保留。' }));
  api.getGmrepoStatistics.mockImplementation(async params => ({ familySize: 322, audit: params.cohort === 'PRJTEST2' ? pendingAudit : audit,
    methods, total: 50, items: params.cohort === 'PRJTEST2' ? [] : [statistic], summary: { unadjustedFdrCount: 0, adjustedFdrCount: 0, concordantFdrCount: 0 } }));
  api.getGmrepoEvidence.mockImplementation(async params => ({ genus, statistic: params.cohort === 'PRJTEST2' ? null : statistic,
    rankBiserialCi: [.1, .7], sourceMarkers: [], sourceNote: '未返回不等于没有差异。', ciMethod: 'bootstrap 2000 次。',
    primary: { status: 'available', cohortId: 'CRA014435', sampleCount: 185, groupCounts: { AD: 122, NC: 63 }, matchedFeatureCount: 3,
      abundanceScale: 'unknown', normalization: 'unknown', speciesPreview: [], reasons: ['主矩阵丰度单位未确认。'], comparisonNote: '物种覆盖不等于差异复现。' } }));
});

function Harness() {
  const [params, setParams] = useSearchParams();
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, String(value)); else next.delete(key);
    if (key === 'analysisCohort' || key === 'analysisQuery') next.delete('analysisPage');
    setParams(next);
  };
  return <GenusWorkspace revision="checked-version" genera={[genus]} params={params} update={update} />;
}

function mount(entry = '/reference/gmrepo?group=NC&scope=pending') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Harness /></MemoryRouter></QueryClientProvider>);
}

test('both groups and QC remain visible; no raw p-value is labeled significant', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: '菌属分布 · 同一队列 AD / NC' })).toBeVisible();
  expect(await screen.findByText('未获 FDR 支持。正效应表示 AD 倾向更高；结果仅供提出研究线索。')).toBeVisible();
  expect(screen.getByText(/主物种矩阵精确属名对应/)).toBeVisible();
  expect(screen.getByText('主矩阵丰度单位未确认。')).toBeVisible();
  fireEvent.click(screen.getByText(/查看全部 1 个散点/));
  expect(screen.getByRole('link', { name: 'ERRZERO ↗' })).toBeVisible();
  expect(screen.getByText('90+')).toBeVisible();
  const params = api.getGmrepoDistribution.mock.calls[0][0];
  expect(params).toEqual({ revision: 'checked-version', cohort: 'PRJTEST1', genus: 'NCBI:816' });
  expect(params).not.toHaveProperty('group');
  selectOption(screen.getByRole('combobox', { name: '图表尺度' }), 'log');
  expect(await screen.findByRole('img', { name: 'Bacteroides log AD/NC 分布' })).toBeVisible();
});

test('pending participant mapping keeps distribution but removes inferential numbers', async () => {
  mount();
  await screen.findByRole('heading', { name: '菌属分布 · 同一队列 AD / NC' });
  selectOption(screen.getByRole('combobox', { name: '分布与检验队列' }), 'PRJTEST2');
  expect(await screen.findByText('差异检验暂缓')).toBeVisible();
  expect(screen.getByText(/本队列仍可查看分布/)).toBeVisible();
  expect(screen.queryByText('未调整 · 秩二列相关')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Bacteroides raw AD/NC 分布' })).toBeVisible();
});

test('search resets the page and keeps cohort and revision in the full-family request', async () => {
  mount('/reference/gmrepo?analysisPage=2');
  await screen.findByLabelText('检索菌属 / 旧名 / TaxID');
  await waitFor(() => expect(api.getGmrepoStatistics).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }), expect.anything()));
  fireEvent.change(screen.getByLabelText('检索菌属 / 旧名 / TaxID'), { target: { value: 'Bacteroides' } });
  await waitFor(() => expect(api.getGmrepoStatistics).toHaveBeenLastCalledWith({ cohort: 'PRJTEST1', revision: 'checked-version', query: 'Bacteroides', limit: 25, offset: 0 }, expect.anything()));
});
