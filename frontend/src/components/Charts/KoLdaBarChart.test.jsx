import { render, screen } from '@testing-library/react';

jest.mock('echarts-for-react', () => ({
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

const ldaData = {
  featureLabel: 'KO',
  method: 'Mann-Whitney U + univariate LDA on log10(abundance + 1)',
  filter: {
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
      ldaScore: 4.25,
      pValue: 0.001,
      log2FC: 2.1,
      meanAD: 120,
      meanNC: 20,
    },
    {
      koId: 'K00002',
      koName: 'K00002',
      enrichedGroup: 'NC',
      ldaScore: 3.5,
      pValue: 0.02,
      log2FC: -1.4,
      meanAD: 12,
      meanNC: 55,
    },
  ],
};

test('renders KO LDA balanced summary and chart payload', () => {
  render(<KoLdaBarChart data={ldaData} />);

  expect(document.body.textContent).toContain('P < 0.05');
  expect(document.body.textContent).toContain('显著 KO: 230');
  expect(document.body.textContent).toContain('AD 富集: 7');
  expect(document.body.textContent).toContain('NC 富集: 223');
  expect(document.body.textContent).toContain('展示 AD Top 7 + NC Top 15');
  expect(document.body.textContent).toContain('LEfSe 风格 LDA');

  const chart = screen.getByTestId('ko-lda-chart');
  expect(chart.textContent).toContain('K00001');
  expect(chart.textContent).toContain('K00002');
  expect(chart.textContent).toContain('AD 富集');
  expect(chart.textContent).toContain('NC 富集');
});

test('builds a diverging horizontal bar chart with AD positive and NC negative', () => {
  render(<KoLdaBarChart data={ldaData} />);

  const option = JSON.parse(screen.getByTestId('ko-lda-chart').textContent);

  expect(option.xAxis.type).toBe('value');
  expect(option.xAxis.name).toBe('NC 富集 ← LDA score → AD 富集');
  expect(option.yAxis.type).toBe('category');
  expect(option.series[0].type).toBe('bar');
  expect(option.series[0].data[0].value).toBe(4.25);
  expect(option.series[0].data[0].ldaScore).toBe(4.25);
  expect(option.series[0].data[0].itemStyle.color).toBe('#d66a58');
  expect(option.series[0].data[1].value).toBe(-3.5);
  expect(option.series[0].data[1].ldaScore).toBe(3.5);
  expect(option.series[0].data[1].itemStyle.color).toBe('#5aa88d');
  expect(screen.getByTestId('ko-lda-tooltip').textContent).toContain('LDA 值: 4.2500');
});

test('falls back to item counts when summary is missing', () => {
  const { summary, ...legacyPayload } = ldaData;
  render(<KoLdaBarChart data={legacyPayload} />);

  expect(document.body.textContent).toContain('显著 KO: 2');
  expect(document.body.textContent).toContain('AD 富集: 1');
  expect(document.body.textContent).toContain('NC 富集: 1');
  expect(document.body.textContent).toContain('展示 AD Top 1 + NC Top 1');
});
