import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ProjectionAuditPanel from './ProjectionAuditPanel';
import useProjectionAudit from '../../hooks/useProjectionAudit';
import useProjectionAuditOptions from '../../hooks/useProjectionAuditOptions';
import useScopedAnalysisSamples from '../../hooks/useScopedAnalysisSamples';

vi.mock('../../hooks/useProjectionAudit', () => ({
  default: vi.fn(),
}));

vi.mock('../../hooks/useProjectionAuditOptions', () => ({
  default: vi.fn(),
}));

vi.mock('../../hooks/useScopedAnalysisSamples', () => ({
  default: vi.fn(),
}));

const baseProps = {
  runKey: 'run-1',
  artifactKey: 'ko-abundance',
  projectionKind: 'composition',
  projectionRequest: {
    scope: { mode: 'cohort', groups: [], sampleCodes: [] },
    topN: 20,
    parameters: {},
  },
  projectionData: { projectionKey: 'projection-key-1' },
};

beforeEach(() => {
  useProjectionAuditOptions.mockReturnValue({
    feature: {
      items: [
        { value: 'K00001', label: 'K00001' },
        { value: 'K00002', label: 'K00002' },
      ],
      loading: false,
    },
    sample: {
      items: [
        { value: 'S1', label: 'S1', group: 'AD' },
        { value: 'S2', label: 'S2', group: 'NC' },
      ],
      loading: false,
    },
    status: { items: [{ value: 'merged', label: 'merged' }], loading: false },
    reason: {
      items: [{
        value: 'category_top_n_aggregation',
        label: 'category_top_n_aggregation',
      }],
      loading: false,
    },
  });
  useScopedAnalysisSamples.mockReturnValue({
    data: [],
    total: 185,
    groupCounts: { AD: 122, NC: 63 },
    availableFields: ['sampleCode', 'phenotype'],
    loading: false,
    fetching: false,
    error: null,
    reload: vi.fn(),
  });
  useProjectionAudit.mockReturnValue({
    data: {
      sections: [
        { key: 'aggregation', title: 'Other 合并明细', total: 1 },
      ],
      columns: [
        { key: 'rank', label: '排序', sortable: true },
        { key: 'feature', label: '类别', sortable: true },
        { key: 'status', label: '处理结果', format: 'status' },
        { key: 'reason', label: '原因', format: 'reason' },
      ],
      summary: {
        sampleCount: 185,
        sourceFeatureCount: 2258,
        returnedFeatureCount: 21,
        mergedFeatureCount: 2238,
        truncatedFeatureCount: 0,
        topNRole: 'aggregation_limit',
      },
      sampleScope: {
        mode: 'cohort',
        sampleCount: 185,
        groupCounts: { AD: 122, NC: 63 },
      },
      items: [{
        rank: 1,
        feature: 'K00001',
        status: 'merged',
        reason: 'category_top_n_aggregation',
      }],
      total: 1,
      limit: 100,
      offset: 0,
    },
    loading: false,
    fetching: false,
    error: null,
    reload: vi.fn(),
  });
});

describe('ProjectionAuditPanel', () => {
  test('loads the chart-specific primary section only after expansion', async () => {
    render(<ProjectionAuditPanel {...baseProps} />);

    expect(useProjectionAudit).toHaveBeenLastCalledWith(
      'run-1',
      'ko-abundance',
      'composition',
      expect.objectContaining({
        projectionKey: 'projection-key-1',
        section: 'aggregation',
      }),
      false,
    );

    fireEvent.click(screen.getByText('查看筛选与合并明细'));

    await waitFor(() => {
      expect(useProjectionAudit).toHaveBeenLastCalledWith(
        'run-1',
        'ko-abundance',
        'composition',
        expect.objectContaining({ section: 'aggregation', limit: 100, offset: 0 }),
        true,
      );
    });
    expect(screen.getByRole('tab', { name: 'Other 合并明细' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('cell', { name: 'K00001' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '已合并' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '按类别 Top N 合并到 Other' })).toBeInTheDocument();
    expect(screen.getByText('长尾聚合上限')).toBeInTheDocument();
    expect(screen.getByText('2,258')).toBeInTheDocument();
    expect(screen.getByText('全部样本')).toBeInTheDocument();
    expect(screen.getByText('185 个样本 · AD 122 · NC 63')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '样本范围' })).not.toBeInTheDocument();
  });

  test('loads scoped sample metadata only after its own disclosure opens', async () => {
    useScopedAnalysisSamples.mockReturnValue({
      data: [{ sampleCode: 'S1', phenotype: 'AD', sourceStudy: '' }],
      total: 1,
      groupCounts: { AD: 1 },
      availableFields: ['sampleCode', 'phenotype'],
      loading: false,
      fetching: false,
      error: null,
      reload: vi.fn(),
    });
    render(<ProjectionAuditPanel {...baseProps} />);
    fireEvent.click(screen.getByText('查看筛选与合并明细'));

    expect(useScopedAnalysisSamples).toHaveBeenLastCalledWith(
      'run-1',
      'ko-abundance',
      expect.objectContaining({ scope: baseProps.projectionRequest.scope, limit: 50 }),
      false,
    );
    fireEvent.click(await screen.findByText('查看参与样本（185）'));
    await waitFor(() => {
      expect(useScopedAnalysisSamples).toHaveBeenLastCalledWith(
        'run-1',
        'ko-abundance',
        expect.objectContaining({ scope: baseProps.projectionRequest.scope, limit: 50 }),
        true,
      );
    });
    expect(screen.getByText('S1')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '来源研究' })).not.toBeInTheDocument();
  });

  test('submits structured dropdown filters and sorts only sortable columns', async () => {
    render(<ProjectionAuditPanel {...baseProps} />);
    fireEvent.click(screen.getByText('查看筛选与合并明细'));

    expect(await screen.findByRole('button', { name: '查询' })).toHaveClass(
      'projection-audit__query-button',
    );
    expect(screen.getByLabelText('特征')).toHaveClass('is-marquee-enabled');
    expect(screen.getByLabelText('样本')).not.toHaveClass('is-marquee-enabled');

    fireEvent.click(await screen.findByLabelText('特征'));
    fireEvent.click(screen.getByRole('option', { name: 'K00001' }));
    fireEvent.click(screen.getByLabelText('样本'));
    fireEvent.click(screen.getByRole('option', { name: 'S1 · AD' }));
    fireEvent.click(screen.getByLabelText('处理结果'));
    fireEvent.click(screen.getByRole('option', { name: '已合并' }));
    fireEvent.click(screen.getByLabelText('原因'));
    fireEvent.click(screen.getByRole('option', { name: '按类别 Top N 合并到 Other' }));
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(useProjectionAudit).toHaveBeenLastCalledWith(
        'run-1',
        'ko-abundance',
        'composition',
        expect.objectContaining({
          filters: {
            feature: 'K00001',
            sample: 'S1',
            status: 'merged',
            reason: 'category_top_n_aggregation',
          },
        }),
        true,
      );
    });

    fireEvent.click(screen.getByTitle('排序：点击排序'));
    await waitFor(() => {
      expect(useProjectionAudit).toHaveBeenLastCalledWith(
        'run-1',
        'ko-abundance',
        'composition',
        expect.objectContaining({ sortBy: 'rank', sortDirection: 'asc' }),
        true,
      );
    });
    expect(screen.queryByTitle('按处理结果排序')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '处理结果' })).not.toHaveAttribute('aria-sort');
  });

  test('switches taxonomy Sankey to its layout-specific section', async () => {
    useProjectionAudit.mockReturnValue({
      data: null,
      loading: true,
      fetching: true,
      error: null,
      reload: vi.fn(),
    });
    render(
      <ProjectionAuditPanel
        {...baseProps}
        projectionKind="taxonomy_sankey"
        projectionData={{ projectionKey: 'sankey-key' }}
      />,
    );

    fireEvent.click(screen.getByText('查看筛选与合并明细'));
    await screen.findByRole('tab', { name: '桑基布局压缩' });
    fireEvent.click(screen.getByRole('tab', { name: '桑基布局压缩' }));

    await waitFor(() => {
      expect(useProjectionAudit).toHaveBeenLastCalledWith(
        'run-1',
        'ko-abundance',
        'taxonomy_sankey',
        expect.objectContaining({ projectionKey: 'sankey-key', section: 'sankey_layout' }),
        true,
      );
    });
  });
});
