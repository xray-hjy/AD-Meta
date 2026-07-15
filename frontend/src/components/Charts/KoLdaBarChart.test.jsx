import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('./CartesianEChart', () => ({
  __esModule: true,
  default: ({ option }) => {
    const tooltip = option?.tooltip?.formatter?.({ data: option.series?.[0]?.data?.[0] }) || '';
    return (
      <div>
        <div data-testid="ko-lda-tooltip">{tooltip}</div>
        <div data-testid="ko-lda-chart">
          {JSON.stringify(option)}
        </div>
      </div>
    );
  },
}));

import KoLdaBarChart from './KoLdaBarChart';

const differentialData = {
  featureLabel: 'KO',
  method: 'Mann-Whitney U with Benjamini-Hochberg FDR',
  filter: {
    qValueMax: 0.05,
    pValueMax: 0.05,
    topN: 30,
    selectionMode: 'balanced_significant_by_group',
    perGroupTopN: 15,
  },
  summary: {
    significantCount: 230,
    adEnrichedCount: 7,
    ncEnrichedCount: 223,
    displayedCount: 22,
    adDisplayedCount: 7,
    ncDisplayedCount: 15,
  },
  items: [
    {
      koId: 'K00001',
      koName: 'K00001',
      enrichedGroup: 'AD',
      effectSize: 0.85,
      pValue: 0.001,
      qValue: 0.01,
      log2FC: 2.1,
      meanAD: 120,
      meanNC: 20,
    },
    {
      koId: 'K00002',
      koName: 'K00002',
      enrichedGroup: 'NC',
      effectSize: -0.7,
      pValue: 0.02,
      qValue: 0.04,
      log2FC: -1.4,
      meanAD: 12,
      meanNC: 55,
    },
  ],
};

test('renders KO FDR-adjusted balanced summary and chart payload', () => {
  render(<KoLdaBarChart data={differentialData} />);

  expect(document.body.textContent).toContain('Q < 0.05');
  expect(document.body.textContent).toContain('显著 KO: 230');
  expect(document.body.textContent).toContain('AD 富集: 7');
  expect(document.body.textContent).toContain('NC 富集: 223');
  expect(document.body.textContent).toContain('展示 AD Top 7 + NC Top 15');
  expect(document.body.textContent).not.toContain('LEfSe 风格 LDA');

  const chart = screen.getByTestId('ko-lda-chart');
  expect(chart.textContent).toContain('K00001');
  expect(chart.textContent).toContain('K00002');
  expect(chart.textContent).toContain('AD 富集');
  expect(chart.textContent).toContain('NC 富集');
});

test('builds a diverging horizontal effect-size chart with AD positive and NC negative', () => {
  render(<KoLdaBarChart data={differentialData} />);

  const option = JSON.parse(screen.getByTestId('ko-lda-chart').textContent);

  expect(option.xAxis.type).toBe('value');
  expect(option.xAxis.name).toBe('NC 富集 ← rank-biserial effect → AD 富集');
  expect(option.yAxis.type).toBe('category');
  expect(option.series[0].type).toBe('bar');
  expect(option.series[0].data[0].value).toBe(0.85);
  expect(option.series[0].data[0].effectSize).toBe(0.85);
  expect(option.series[0].data[0].itemStyle.color).toBe('#e74c3c');
  expect(option.series[0].data[1].value).toBe(-0.7);
  expect(option.series[0].data[1].effectSize).toBe(-0.7);
  expect(option.series[0].data[1].itemStyle.color).toBe('#2ecc71');
  expect(screen.getByTestId('ko-lda-tooltip').textContent).toContain('rank-biserial 效应量: 0.8500');
  expect(screen.getByTestId('ko-lda-tooltip').textContent).toContain('q 值: 0.0100');
});

test('falls back to item counts when summary is missing', () => {
  const legacyPayload = { ...differentialData };
  delete legacyPayload.summary;
  render(<KoLdaBarChart data={legacyPayload} />);

  expect(document.body.textContent).toContain('显著 KO: 2');
  expect(document.body.textContent).toContain('AD 富集: 1');
  expect(document.body.textContent).toContain('NC 富集: 1');
  expect(document.body.textContent).toContain('展示 AD Top 1 + NC Top 1');
});
