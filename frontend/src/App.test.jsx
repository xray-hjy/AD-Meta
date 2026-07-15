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

vi.mock('./components/Charts/BoxPlot', () => ({ default: () => <div data-testid="boxplot-chart" /> }));

vi.mock('./components/Charts/Heatmap', () => ({ default: () => <div data-testid="heatmap-chart" /> }));

vi.mock('./components/Charts/DetectionHeatmap', () => ({ default: () => <div data-testid="detection-chart" /> }));

vi.mock('./components/Charts/KoLdaBarChart', () => ({ default: () => <div data-testid="lda-chart" /> }));

vi.mock('./components/Charts/TaxonomyChart', () => ({ default: () => <div data-testid="taxonomy-chart" /> }));

vi.mock('./components/Charts/PCAPlot', () => ({ default: () => <div data-testid="pca-chart" /> }));

vi.mock('./components/Charts/PCoAPlot', () => ({ default: () => <div data-testid="pcoa-chart" /> }));

let datasets;
let summaries;

beforeEach(() => {
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

  fetchJson.mockImplementation(async url => {
    if (url === '/api/datasets') {
      return datasets;
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

  await waitFor(() => {
    expect(screen.getByText('KO 检出率热图')).toBeTruthy();
  });

  expect(screen.getAllByText('丰度对比').length).toBeGreaterThan(0);
  expect(screen.getByText('KO 功能组成')).toBeTruthy();
  expect(screen.getByText('KO 检出率热图')).toBeTruthy();
  expect(screen.getByText('KO 差异特征')).toBeTruthy();
  expect(screen.queryByText('差异热图')).toBeNull();
  expect(screen.queryByText('丰度箱线图')).toBeNull();
  expect(screen.queryByText('分类层级图')).toBeNull();
  expect(screen.queryByText('KO PCA')).toBeNull();
  expect(screen.queryByText('KO PCoA')).toBeNull();
});

test('describes imported matrices as analysis data with an explicit sample scope', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('option', { name: 'KO 功能丰度矩阵' })).toBeTruthy();
    expect(screen.getByText('4 样本 · AD 2 / NC 2')).toBeTruthy();
  });

  expect(screen.getByText('分析数据')).toBeTruthy();
  expect(screen.getByLabelText('选择分析数据')).toBeTruthy();
  expect(screen.queryByText('预计算数据')).toBeNull();
});

test('does not show KO differential tab for taxonomy datasets', async () => {
  datasets = [{
    slug: 'ad-nc-species',
    name: 'AD vs NC Species',
    featureKind: 'taxonomy',
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
    expect(screen.getByText('KO 功能组成')).toBeTruthy();
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

test('passes feature metadata to the phylum composition chart', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('KO 功能组成')).toBeTruthy();
  });

  fetchJson.mockImplementation(async url => {
    if (url === '/api/datasets') return datasets;
    const summaryMatch = url.match(/^\/api\/datasets\/([^/]+)\/summary$/);
    if (summaryMatch) return summaries[summaryMatch[1]];
    if (/^\/api\/datasets\/[^/]+\/charts\/phylum$/.test(url)) return [];
    if (/^\/api\/datasets\/[^/]+\/charts\/species$/.test(url)) return [];
    throw new Error(`Unexpected URL: ${url}`);
  });

  fireEvent.click(screen.getByText('KO 功能组成'));

  await waitFor(() => {
    expect(screen.getByTestId('phylum-chart')).toBeTruthy();
  });

  expect(screen.getByTestId('phylum-chart').getAttribute('data-feature-kind')).toBe('ko');
  expect(screen.getByTestId('phylum-chart').getAttribute('data-feature-label')).toBe('KO');
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
    if (url === '/api/datasets') return datasets;
    if (url.endsWith('/summary')) return summaries['ad-nc-ko-abundance'];
    if (url.endsWith('/charts/differential_ko')) return { items: [] };
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<App />);
  await waitFor(() => expect(screen.getByTestId('lda-chart')).toBeTruthy());
  expect(new URLSearchParams(window.location.search).get('dataset')).toBe('ad-nc-ko-abundance');
  expect(new URLSearchParams(window.location.search).get('chart')).toBe('differential_ko');
});
