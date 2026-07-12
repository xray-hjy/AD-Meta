import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { fetchJson } from './api/client';

jest.mock('./api/client', () => ({
  fetchJson: jest.fn(),
}));

jest.mock('./components/StatsCards', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'stats-cards' });
});

jest.mock('./components/Charts/BarChart', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'bar-chart' });
});

jest.mock('./components/Charts/PhylumChart', () => ({ featureKind, featureLabel }) => {
  const React = require('react');
  return React.createElement('div', {
    'data-testid': 'phylum-chart',
    'data-feature-kind': featureKind,
    'data-feature-label': featureLabel,
  });
});

jest.mock('./components/Charts/BoxPlot', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'boxplot-chart' });
});

jest.mock('./components/Charts/Heatmap', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'heatmap-chart' });
});

jest.mock('./components/Charts/DetectionHeatmap', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'detection-chart' });
});

jest.mock('./components/Charts/KoLdaBarChart', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'lda-chart' });
}, { virtual: true });

jest.mock('./components/Charts/SunburstChart', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'sunburst-chart' });
});

jest.mock('./components/Charts/PCAPlot', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'pca-chart' });
});

jest.mock('./components/Charts/PCoAPlot', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'pcoa-chart' });
});

let datasets;
let summaries;

beforeEach(() => {
  datasets = [{ slug: 'ad-nc-ko-abundance', name: 'AD vs NC KO Abundance' }];
  summaries = {
    'ad-nc-ko-abundance': {
      datasetName: 'AD vs NC KO Abundance',
      featureKind: 'ko',
      featureLabel: 'KO',
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
});

test('shows the four supported chart tabs for KO datasets', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('KO 检出率热图')).toBeTruthy();
  });

  expect(screen.getByText('丰度对比')).toBeTruthy();
  expect(screen.getByText('KO 功能组成')).toBeTruthy();
  expect(screen.getByText('KO 检出率热图')).toBeTruthy();
  expect(screen.getByText('KO 功能 LDA 值柱状图')).toBeTruthy();
  expect(screen.queryByText('丰度热图')).toBeNull();
  expect(screen.queryByText('丰度箱线图')).toBeNull();
  expect(screen.queryByText('KO 旭日图')).toBeNull();
  expect(screen.queryByText('KO PCA')).toBeNull();
  expect(screen.queryByText('KO PCoA')).toBeNull();
});

test('does not show KO LDA tab for taxonomy datasets', async () => {
  datasets = [{ slug: 'ad-nc-species', name: 'AD vs NC Species' }];
  summaries = {
    'ad-nc-species': {
      datasetName: 'AD vs NC Species',
      featureKind: 'taxonomy',
      featureLabel: '物种',
    },
  };

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('丰度热图')).toBeTruthy();
  });

  expect(screen.queryByText('KO 功能 LDA 值柱状图')).toBeNull();
});

test('separates the desktop sidebar and main content into independent scroll regions', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('KO 功能组成')).toBeTruthy();
  });

  expect(document.querySelector('aside.sidebar')?.getAttribute('data-scroll-region')).toBe('sidebar');
  expect(document.querySelector('main.main-content')?.getAttribute('data-scroll-region')).toBe('main');
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
