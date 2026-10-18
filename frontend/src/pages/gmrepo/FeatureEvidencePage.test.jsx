import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import * as api from '../../api/gmrepo';
import FeatureEvidencePage from './FeatureEvidencePage';

vi.mock('../../api/gmrepo', () => ({ getGmrepoCatalog: vi.fn(), getGmrepoGenera: vi.fn(), resolveGmrepoSubject: vi.fn(), getGmrepoEvaluation: vi.fn(), getGmrepoEvaluationPackage: vi.fn(), gmrepoReportUrl: vi.fn(), gmrepoReplayUrl: vi.fn() }));
vi.mock('./GenusWorkspace', () => ({ default: ({ params, sourceRevision }) => <div>分布对象 {params.get('analysisGenus')} · 主版本 {sourceRevision} · 队列 {params.get('analysisCohort')}</div> }));
const genus = { featureId: 'NCBI:570', name: 'Klebsiella', domain: 'Bacteria' };

beforeEach(() => {
  vi.clearAllMocks();
  api.getGmrepoCatalog.mockResolvedValue({ provenance: { fingerprint: 'ref-fixed', version: 'ref-v1' } });
  api.getGmrepoGenera.mockResolvedValue({ items: [genus] });
  api.resolveGmrepoSubject.mockResolvedValue({ status: 'mapped', subjectType: 'species', subjectId: '1', subjectName: 'Klebsiella pneumoniae', sourceRevision: 'source-fixed', datasetSlug: 'ad-nc-species', mappingLevel: 'genus_background', genus, reasons: ['属级背景，不是物种复现'], mappingMethod: '域一致对应' });
  api.getGmrepoEvaluation.mockResolvedValue({ genus, familySize: 322, methods: { version: 'rank-v1' }, summary: { rulesVersion: 'summary-v1', observations: [{ id: 'scope', text: '两队列可检验，独立性待核查', evidenceIds: ['P1', 'P2'] }] }, cohorts: [] });
  api.gmrepoReportUrl.mockReturnValue('/api/references/gmrepo/report');
});

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><FeatureEvidencePage /></MemoryRouter></QueryClientProvider>);
}

test('resolves the source feature and fixed version before loading external evidence', async () => {
  mount('/reference/gmrepo/evidence?subjectType=species&subjectId=1&sourceRevision=source-fixed&revision=ref-fixed&returnTo=%2Fanalysis%2Fabundance%3Fchart%3Dboxplot&sourceScope=%7B%22group%22%3A%22AD%22%7D');
  expect(await screen.findByText('Klebsiella pneumoniae')).toBeVisible();
  expect(await screen.findByText('两队列可检验，独立性待核查')).toBeVisible();
  await waitFor(() => expect(api.getGmrepoEvaluation).toHaveBeenCalledWith(expect.objectContaining({ genus: 'NCBI:570', sourceRevision: 'source-fixed', revision: 'ref-fixed' }), expect.anything()));
  expect(screen.getByRole('heading', { level: 1, name: 'Klebsiella pneumoniae' })).toBeVisible();
  expect(screen.queryByText('EXTERNAL EVIDENCE EVALUATION')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/对象与版本详情/));
  expect(screen.getByText('所属属的外部背景')).toBeVisible();
  expect(screen.getByRole('link', { name: '返回主分析' })).toHaveAttribute('href', '/analysis/abundance?chart=boxplot');
  expect(await screen.findByText(/分布对象 NCBI:570/)).toBeVisible();
});

test('reads an archived evaluation by id without generating a current replacement', async () => {
  api.getGmrepoEvaluationPackage.mockResolvedValue({ payload: { subject: null, sourceContext: { scope: {} }, evaluation: {
    genus, provenance: { fingerprint: 'ref-old', version: 'old-reference' }, generatedAt: '2026-10-01', cohorts: [], methods: { version: 'rank-v1' },
    summary: { rulesVersion: 'v1', observations: [{ id: 'scope', text: '归档结果，不重算', evidenceIds: [] }] }, familySize: 322,
  } }, currentStatus: { status: 'historical', currentUse: 'requires_reevaluation', reasons: ['代码已变化'] } });
  mount('/reference/gmrepo/evidence?evaluationId=abc');
  expect(await screen.findByText('归档结果，不重算')).toBeVisible();
  expect(screen.getByText(/历史评估：当前依赖已变化/)).toBeVisible();
  expect(api.resolveGmrepoSubject).not.toHaveBeenCalled();
  expect(api.getGmrepoEvaluation).not.toHaveBeenCalled();
  expect(api.getGmrepoGenera).not.toHaveBeenCalled();
});

test('unresolved source never renders an arbitrary default genus or quantitative evidence', async () => {
  api.resolveGmrepoSubject.mockResolvedValue({ status: 'unresolved', subjectName: 'MAG1', sourceRevision: 'mag-fixed', mappingLevel: 'none', genus: null, reasons: ['缺少可靠 NCBI 属路径'] });
  mount('/reference/gmrepo/evidence?subjectType=mag&subjectId=MAG1&sourceRevision=mag-fixed&revision=ref-fixed');
  expect(await screen.findByText('缺少可靠 NCBI 属路径')).toBeVisible();
  expect(api.getGmrepoEvaluation).not.toHaveBeenCalled();
  expect(screen.queryByText('外部队列比较')).not.toBeInTheDocument();
});

test('without a subject requires an explicit selection', async () => {
  mount('/reference/gmrepo/evidence?revision=ref-fixed');
  expect(await screen.findByRole('heading', { level: 1, name: '参考菌属检索' })).toBeVisible();
  expect(await screen.findByRole('heading', { name: '参考菌属目录' })).toBeVisible();
  expect(api.resolveGmrepoSubject).not.toHaveBeenCalled();
  expect(api.getGmrepoEvaluation).not.toHaveBeenCalled();
});

test('selecting a cohort updates the distribution without replacing the original subject or source version', async () => {
  const cohort = (id, allowed) => ({ projectId: id, platform: '16S', audit: { groupCounts: { AD: 10, NC: 12 }, adjustedCount: 0,
    unadjustedStatus: allowed ? 'eligible' : 'blocked', reviewNote: '研究核查记录', unadjustedReasons: allowed ? [] : ['参与者待核对'] },
    statistic: allowed ? { rankBiserial: 0.3, qValue: 0.2 } : null });
  api.getGmrepoEvaluation.mockResolvedValue({ genus, familySize: 322, methods: { version: 'rank-v1' },
    summary: { rulesVersion: 'rules-v1', observations: [] }, cohorts: [cohort('P1', true), cohort('P2', false)] });
  mount('/reference/gmrepo/evidence?subjectType=species&subjectId=1&sourceRevision=source-fixed&revision=ref-fixed');
  const button = await screen.findByRole('button', { name: '查看 P2 分布' });
  expect(button.closest('tr')).toHaveTextContent('仅描述');
  fireEvent.click(button);
  expect(await screen.findByText(/队列 P2/)).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: 'Klebsiella pneumoniae' })).toBeVisible();
  expect(button.closest('tr')).toHaveAttribute('aria-selected', 'true');
  expect(api.getGmrepoEvaluation).toHaveBeenLastCalledWith(expect.objectContaining({ genus: 'NCBI:570', sourceRevision: 'source-fixed' }), expect.anything());
});

test('the fixed report uses the evaluation id and captures the original source context', async () => {
  const baseline = await api.getGmrepoEvaluation();
  api.getGmrepoEvaluation.mockResolvedValue({ ...baseline, evaluationId: 'fixed-evaluation', generatedAt: '2026-10-15', snapshotStatus: { status: 'current' } });
  mount('/reference/gmrepo/evidence?subjectType=species&subjectId=1&sourceRevision=source-fixed&revision=ref-fixed&sourceChart=boxplot&sourceScope=%7B%22group%22%3A%22AD%22%7D');
  await screen.findByRole('link', { name: '导出评估报告' });
  await waitFor(() => expect(api.gmrepoReportUrl).toHaveBeenLastCalledWith(expect.objectContaining({ evaluationId: 'fixed-evaluation' })));
  expect(api.getGmrepoEvaluation).toHaveBeenLastCalledWith(expect.objectContaining({ subjectType: 'species', subjectId: '1', sourceChart: 'boxplot', sourceScope: '{"group":"AD"}' }), expect.anything());
  fireEvent.click(screen.getByText('固定评估与当前用途状态'));
  expect(screen.getByText(/fixed-evaluation/)).toBeVisible();
});
