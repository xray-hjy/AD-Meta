import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HeatmapAnalysisPanel, { heatmapNumber } from './HeatmapAnalysisPanel';

vi.mock('./CartesianEChart', () => ({ default: props => <div aria-label={props.ariaLabel} /> }));

const data = {
  summary: { sourceFeatureCount: 1828, testedFeatureCount: 1828, excludedFeatureCount: 0, rawPLt005Count: 94,
    qPassCount: 0, effectPassCount: 1307, bothPassCount: 0, minQ: .0742237, displayedCount: 0, epsilonSensitiveCount: 679 },
  analysisRecord: { analysisKey: 'a'.repeat(64), groupCounts: { AD: 122, NC: 63 }, prefilter: { mode: 'none' }, inputScale: 'relative_abundance', samples: [] },
  filter: { qValueMax: .05, log2FcMinAbs: 1 },
  display: { viewMode: 'differential', selectionNote: '统计筛选', clustering: 'hierarchical' }, stats: [],
};

test('zero candidates explain the full family and require an explicit exploration action', () => {
  const explore = vi.fn();
  render(<HeatmapAnalysisPanel data={data} onExplore={explore} />);
  expect(screen.getByText('本次统计筛选为零候选，丰度数据仍可查看')).toBeVisible();
  expect(screen.getByText(/不等于不存在生物学差异/)).toBeVisible();
  expect(screen.getByText(/默认不预筛/)).toBeVisible();
  expect(explore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '查看探索性丰度热图' }));
  expect(explore).toHaveBeenCalledOnce();
});

test('exploratory q-ranked view makes use of group labels explicit', () => {
  render(<HeatmapAnalysisPanel data={{ ...data, display: { ...data.display, viewMode: 'exploratory', ranking: 'q_value' } }} />);
  expect(screen.getByText('探索性丰度热图 · 不代表显著差异')).toBeVisible();
  expect(screen.getByText(/不能再被解释为独立、无监督/)).toBeVisible();
});

test('precise statistical formatting preserves small values, integer zeros and unavailable values', () => {
  expect(heatmapNumber(100000)).toBe('100000');
  expect(heatmapNumber(1e-10)).toBe('1e-10');
  expect(heatmapNumber(0)).toBe('0');
  expect(heatmapNumber(null)).toBe('—');
});
