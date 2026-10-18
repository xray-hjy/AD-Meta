import { fireEvent, render, screen } from '@testing-library/react';
import ResearchEvidenceDetails from './ResearchEvidenceDetails';

const record = { projectId: 'PRJTEST1', studyId: null, installed: true,
  capabilities: { unadjusted: { status: 'eligible' }, adjusted: { status: 'blocked' }, scientificReview: { status: 'pending' } },
  fields: { material: { value: null, rawValue: 'stool?', status: 'source_record_unreviewed', evidenceRefs: ['source.json#/material'] } },
  blockers: [{ reasonCode: 'ADJUSTED_SAMPLE_TOO_SMALL', message: '调整完整病例不足', scope: '固定比较', affects: ['adjusted'], missingEvidence: '完整年龄和性别', nextAction: '核对作者原件，不插补', evidenceRefs: [] }],
  comparison: { observationUnit: 'Run', plotReadyRuns: 50, adjustedCount: 12, allRunSetSha256: 'all-runs', plotRunSetSha256: 'plot-runs', adjustedRunSetSha256: 'adjusted-runs' },
  reviews: [{ reviewId: 'legacy', purpose: 'identity', decision: 'reviewed_unique_participants', note: '历史专项身份依据', reviewer: null, reviewedOn: null, evidenceRefs: ['identity.json'] }] };

test('shows use limits and source evidence without team review tasks', () => {
  render(<ResearchEvidenceDetails record={record} />);
  expect(screen.getByText(/不按项目编号认定独立研究/)).toBeVisible();
  expect(screen.getByText('具备当前资格')).toBeVisible();
  expect(screen.getByText('暂缓')).toBeVisible();
  expect(screen.queryByText('科研复核')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('研究字段与依据'));
  expect(screen.getByText('来源原值（未复核）：stool?')).toBeVisible();
  expect(screen.getByText(/source.json#\/material/)).toBeVisible();
  fireEvent.click(screen.getByText('证据适用限制（1）'));
  expect(screen.getByText('依据缺口：完整年龄和性别')).toBeVisible();
  expect(screen.queryByText(/下一步：/)).not.toBeInTheDocument();
});

test('retains exact comparison sets without personnel or sign-off UI', () => {
  render(<ResearchEvidenceDetails record={record} />);
  fireEvent.click(screen.getByText('比较范围与版本依据'));
  expect(screen.queryByText(/复核人员|签署日期|专项审查记录/)).not.toBeInTheDocument();
  expect(screen.getByText('all-runs')).toBeVisible();
  expect(screen.getByText('plot-runs')).toBeVisible();
  expect(screen.getByText('adjusted-runs')).toBeVisible();
});

test('sourced screening and field locators remain distinct from scientific approval', () => {
  render(<ResearchEvidenceDetails record={{ ...record, screening: { status: 'stage_reference', note: '认知主诉人群，排除痴呆，不是 AD/NC' },
    fields: { material: { value: '人体粪便', rawValue: null, status: 'documented_pending_review', evidenceRefs: ['paper'], locator: 'Methods / Sample collection' } },
    sources: [{ sourceId: 'paper', url: 'https://example.org/paper', path: 'paper.xml', sha256: 'source-sha', availability: 'verified' }] }} />);
  expect(screen.getByText('认知主诉人群，排除痴呆，不是 AD/NC')).toBeVisible();
  expect(screen.getByText(/不构成临床验证/)).toBeVisible();
  fireEvent.click(screen.getByText('研究字段与依据'));
  expect(screen.getByText('人体粪便')).toBeVisible();
  expect(screen.getByText(/Methods \/ Sample collection/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'paper ↗' })).toHaveAttribute('href', 'https://example.org/paper');
});

test('omits process-only blockers but never hides scientific constraints', () => {
  render(<ResearchEvidenceDetails record={{ ...record, blockers: [...record.blockers,
    { reasonCode: 'SCIENTIFIC_REVIEW_PENDING', message: '组员尚未签署', affects: ['scientificReview'] }],
    relationships: [{ relationshipId: 'pair', leftNode: 'A', rightNode: 'B', runIntersection: [], biosampleIntersection: [],
      effectiveOpinions: [{ reviewId: 'scope', note: '限定编号范围未见重叠', examinedLevels: ['Run'], reviewer: 'Not public', reviewedOn: '2026-10-16' }] }] }} />);
  expect(screen.queryByText('组员尚未签署')).not.toBeInTheDocument();
  expect(screen.getByText('证据适用限制（1）')).toBeVisible();
  fireEvent.click(screen.getByText('研究间与主队列重叠核查（1 对）'));
  expect(screen.getByText('编号比对不能证明参与者独立')).toBeVisible();
  expect(screen.getByText(/限定编号范围未见重叠/)).toBeVisible();
  expect(screen.queryByText(/Not public|2026-10-16/)).not.toBeInTheDocument();
});
