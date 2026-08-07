import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { fetchJson } from './api/client';
import { queryClient } from './api/queryClient';

vi.mock('./api/client', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('./components/Charts/BarChart', () => ({
  default: () => <div data-testid="bar-chart" />,
}));

vi.mock('./components/Charts/PhylumChart', () => ({
  default: ({ featureKind, featureLabel }) => (
    <div data-testid="phylum-chart" data-feature-kind={featureKind} data-feature-label={featureLabel} />
  ),
}));

vi.mock('./components/Charts/KoContributionChart', () => ({
  default: ({ data }) => (
    <div data-testid="ko-contribution-chart" data-item-count={data?.items?.length || 0} />
  ),
}));

vi.mock('./components/Charts/BoxPlot', () => ({ default: () => <div data-testid="boxplot-chart" /> }));

vi.mock('./components/Charts/Heatmap', () => ({ default: () => <div data-testid="heatmap-chart" /> }));

vi.mock('./components/Charts/DetectionHeatmap', () => ({ default: () => <div data-testid="detection-chart" /> }));

vi.mock('./components/Charts/KoLdaBarChart', () => ({ default: () => <div data-testid="lda-chart" /> }));

vi.mock('./components/Charts/TaxonomyChart', () => ({ default: () => <div data-testid="taxonomy-chart" /> }));

vi.mock('./components/Charts/PCAPlot', () => ({ default: () => <div data-testid="pca-chart" /> }));

vi.mock('./components/Charts/PCoAPlot', () => ({ default: () => <div data-testid="pcoa-chart" /> }));

let datasets;
let summaries;
let analysisRuns;

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/analysis/abundance');
  datasets = [{
    slug: 'ad-nc-ko-abundance',
    name: 'AD vs NC KO Abundance',
    featureKind: 'ko',
  }];
  summaries = {
    'ad-nc-ko-abundance': {
      datasetName: 'AD vs NC KO Abundance',
      featureKind: 'ko',
      featureLabel: 'KO',
      totalSamples: 4,
      adSamples: 2,
      ncSamples: 2,
      totalFeatures: 3,
    },
  };
  analysisRuns = [{
    key: 'ad-nc-baseline',
    name: 'AD/NC 群落分析基线',
    sampleCount: 4,
    artifacts: [{
      key: 'ko-abundance',
      type: 'ko_abundance',
      datasetSlug: 'ad-nc-ko-abundance',
      sampleCount: 4,
    }],
  }];

  fetchJson.mockImplementation(async url => {
    if (url === '/api/analysis-runs') {
      return analysisRuns;
    }
    if (url === '/api/datasets') {
      return datasets;
    }
    if (/^\/api\/analysis-runs\/[^/]+\/samples\?/.test(url)) {
      return {
        items: [
          { sampleCode: 'S1', phenotype: 'AD' },
          { sampleCode: 'S2', phenotype: 'NC' },
        ],
        total: 2,
        limit: 500,
        offset: 0,
      };
    }
    if (/^\/api\/analysis-runs\/[^/]+\/artifacts\/[^/]+\/projections\/abundance$/.test(url)) {
      return {
        projectionKey: 'projection-1',
        featureKind: 'ko',
        featureLabel: 'KO',
        scope: { mode: 'cohort', groups: [], sampleCodes: [] },
        series: [
          { key: 'AD', label: 'AD 均值', group: 'AD', color: '#e74c3c' },
          { key: 'NC', label: 'NC 均值', group: 'NC', color: '#2ecc71' },
        ],
        items: [{ feature: 'K00001', values: { AD: { mean: 2 }, NC: { mean: 1 } } }],
        projection: {
          sampleCount: 4,
          sourceFeatureCount: 3,
          returnedFeatureCount: 1,
          mergedFeatureCount: 0,
        },
      };
    }
    const summaryMatch = url.match(/^\/api\/datasets\/([^/]+)\/summary$/);
    if (summaryMatch) {
      return summaries[summaryMatch[1]];
    }
    if (/^\/api\/datasets\/[^/]+\/charts\/species$/.test(url)) {
      return [];
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
});

afterEach(() => {
  fetchJson.mockReset();
  queryClient.clear();
});

test('shows the four supported chart tabs for KO datasets', async () => {
  render(<App />);

  expect(
    await screen.findByText('KO 检出率热图', {}, { timeout: 3000 })
  ).toBeTruthy();

  expect(screen.getAllByText('丰度对比').length).toBeGreaterThan(0);
  expect(screen.getByText('高丰度 KO')).toBeTruthy();
  expect(screen.getByText('KO 检出率热图')).toBeTruthy();
  expect(screen.getByText('KO 差异特征')).toBeTruthy();
  expect(screen.queryByText('差异热图')).toBeNull();
  expect(screen.queryByText('丰度箱线图')).toBeNull();
  expect(screen.queryByText('分类层级图')).toBeNull();
  expect(screen.queryByText('KO PCA')).toBeNull();
  expect(screen.queryByText('KO PCoA')).toBeNull();
});

test('stores the selected scientific scope in the URL and requests a group projection', async () => {
  render(<App />);
  const ncButton = await screen.findByRole('button', { name: 'NC 组' });

  fireEvent.click(ncButton);

  await waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get('scope')).toBe('group');
    expect(params.get('group')).toBe('NC');
  });
  await waitFor(() => {
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/analysis-runs/ad-nc-baseline/artifacts/ko-abundance/projections/abundance',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          scope: { mode: 'group', groups: ['NC'], sampleCodes: [] },
        }),
      })
    );
  });
});

test('describes the selected analysis run and current artifact sample coverage', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('option', { name: 'AD/NC 群落分析基线' })).toBeTruthy();
    expect(screen.getByText('运行 4 样本 · 当前结果覆盖 4')).toBeTruthy();
  });

  expect(screen.getByText('分析运行')).toBeTruthy();
  expect(screen.getByLabelText('选择分析运行')).toBeTruthy();
  expect(screen.queryByText('预计算数据')).toBeNull();
});

test('reports a missing analysis run without misreporting insufficient samples', async () => {
  analysisRuns = [];

  render(<App />);

  expect(
    await screen.findByText('尚未登记分析运行，请先同步分析运行清单。')
  ).toBeTruthy();
  expect(screen.getByText('尚未登记分析运行')).toBeTruthy();
  expect(screen.getByText('配置未完成')).toBeTruthy();
  expect(screen.queryByText(/至少需要.+样本/)).toBeNull();
  expect(fetchJson.mock.calls.some(([url]) => /\/analysis-runs\/[^/]+\/samples\?/.test(url)))
    .toBe(false);
});

test('keeps the workspace label and subtitle on the same branding row', async () => {
  render(<App />);

  const workspaceLabel = await screen.findByText('分析工作区');
  const subtitle = screen.getByText('群落物种与功能分析');

  expect(workspaceLabel.parentElement).toBe(subtitle.parentElement);
  expect(workspaceLabel.parentElement).toHaveClass('workspace-branding__context');
});

test('toggles the global color-blind-friendly chart preference', async () => {
  render(<App />);

  const toggle = await screen.findByRole('checkbox', { name: '色盲友好' });
  expect(toggle).toBeChecked();

  fireEvent.click(toggle);

  expect(toggle).not.toBeChecked();
  expect(window.localStorage.getItem('ad-meta:accessibility:colorblind-v1')).toBe('false');
  expect(document.documentElement.dataset.colorBlindFriendly).toBe('false');
});

test('does not show KO differential tab for taxonomy datasets', async () => {
  datasets = [{
    slug: 'ad-nc-species',
    name: 'AD vs NC Species',
    featureKind: 'taxonomy',
  }];
  analysisRuns = [{
    key: 'ad-nc-baseline',
    name: 'AD/NC 群落分析基线',
    sampleCount: 4,
    artifacts: [{
      key: 'species-abundance',
      type: 'species_abundance',
      datasetSlug: 'ad-nc-species',
      sampleCount: 4,
    }],
  }];
  summaries = {
    'ad-nc-species': {
      datasetName: 'AD vs NC Species',
      featureKind: 'taxonomy',
      featureLabel: '物种',
      totalSamples: 4,
      adSamples: 2,
      ncSamples: 2,
      totalFeatures: 3,
    },
  };

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('差异热图')).toBeTruthy();
  });

  expect(screen.queryByText('KO 差异特征')).toBeNull();
});

test('separates the desktop sidebar and main content into independent scroll regions', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('高丰度 KO')).toBeTruthy();
  });

  expect(document.querySelector('aside.sidebar')?.getAttribute('data-scroll-region')).toBe('sidebar');
  expect(document.querySelector('main.main-content')?.getAttribute('data-scroll-region')).toBe('main');
});

test('keeps future analysis domains visible but disabled', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /群落功能/ })).toBeTruthy();
  });

  expect(screen.getByRole('button', { name: /物种-功能联合/ }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: /MAG 解析/ }).disabled).toBe(true);
});

test('uses the dedicated KO contribution projection instead of taxonomy composition', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('高丰度 KO')).toBeTruthy();
  });

  fetchJson.mockImplementation(async url => {
    if (url === '/api/analysis-runs') return analysisRuns;
    if (url === '/api/datasets') return datasets;
    if (/^\/api\/analysis-runs\/[^/]+\/samples\?/.test(url)) {
      return {
        items: [
          { sampleCode: 'AD-1', phenotype: 'AD' },
          { sampleCode: 'AD-2', phenotype: 'AD' },
          { sampleCode: 'AD-3', phenotype: 'AD' },
          { sampleCode: 'NC-1', phenotype: 'NC' },
          { sampleCode: 'NC-2', phenotype: 'NC' },
          { sampleCode: 'NC-3', phenotype: 'NC' },
        ],
        total: 6,
        limit: 500,
        offset: 0,
      };
    }
    if (/^\/api\/analysis-runs\/[^/]+\/artifacts\/[^/]+\/projections\/ko_contribution$/.test(url)) {
      return {
        projectionKey: 'ko-contribution-test',
        payload: {
          series: [{ key: 'AD', label: 'AD 均值', color: '#e74c3c' }],
          items: [{ feature: 'K00001', values: { AD: 0.2 } }],
          sourceFeatureCount: 3,
          omittedFeatureCount: 2,
          coverageBySeries: { AD: 0.2 },
        },
        projection: { sampleCount: 4, sourceFeatureCount: 3, returnedFeatureCount: 1, mergedFeatureCount: 0 },
      };
    }
    const summaryMatch = url.match(/^\/api\/datasets\/([^/]+)\/summary$/);
    if (summaryMatch) return summaries[summaryMatch[1]];
    if (/^\/api\/datasets\/[^/]+\/charts\/species$/.test(url)) return [];
    throw new Error(`Unexpected URL: ${url}`);
  });

  fireEvent.click(screen.getByText('高丰度 KO'));

  await waitFor(() => {
    expect(screen.getByTestId('ko-contribution-chart')).toBeTruthy();
  });

  expect(screen.getByTestId('ko-contribution-chart').getAttribute('data-item-count')).toBe('1');
  expect(fetchJson).toHaveBeenCalledWith(
    '/api/analysis-runs/ad-nc-baseline/artifacts/ko-abundance/projections/ko_contribution',
    expect.objectContaining({ method: 'POST' })
  );
});

test('restores dataset and chart selection from a shareable deep link', async () => {
  window.history.pushState(
    {},
    '',
    '/analysis/abundance?dataset=ad-nc-ko-abundance&chart=differential_ko'
  );
  summaries['ad-nc-ko-abundance'].availableArtifacts = [
    'species',
    'phylum',
    'detection',
    'differential_ko',
  ];
  fetchJson.mockImplementation(async url => {
    if (url === '/api/analysis-runs') return analysisRuns;
    if (url === '/api/datasets') return datasets;
    if (/^\/api\/analysis-runs\/[^/]+\/samples\?/.test(url)) {
      return {
        items: [
          { sampleCode: 'AD-1', phenotype: 'AD' },
          { sampleCode: 'AD-2', phenotype: 'AD' },
          { sampleCode: 'AD-3', phenotype: 'AD' },
          { sampleCode: 'NC-1', phenotype: 'NC' },
          { sampleCode: 'NC-2', phenotype: 'NC' },
          { sampleCode: 'NC-3', phenotype: 'NC' },
        ],
        total: 6,
        limit: 500,
        offset: 0,
      };
    }
    if (/^\/api\/analysis-runs\/[^/]+\/artifacts\/[^/]+\/projections\/differential_ko$/.test(url)) {
      return {
        projectionKey: 'differential-test',
        payload: { items: [] },
        projection: { sampleCount: 4, sourceFeatureCount: 3, returnedFeatureCount: 0, mergedFeatureCount: 0 },
      };
    }
    if (url.endsWith('/summary')) return summaries['ad-nc-ko-abundance'];
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<App />);
  await waitFor(() => expect(screen.getByTestId('lda-chart')).toBeTruthy(), { timeout: 3000 });
  expect(new URLSearchParams(window.location.search).get('dataset')).toBe('ad-nc-ko-abundance');
  expect(new URLSearchParams(window.location.search).get('chart')).toBe('differential_ko');
});
