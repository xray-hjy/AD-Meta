import { render, screen } from '@testing-library/react';
import TaxonomyChart from './TaxonomyChart';

const mockEChartsProps = jest.fn();

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: props => {
    const React = require('react');
    mockEChartsProps(props);
    return React.createElement('div', { 'data-testid': 'echarts' });
  },
}));

jest.mock('../../hooks/useAvailableViewport', () => () => ({
  width: 1228,
  height: 1180,
}));

const sankeyPayload = {
  kind: 'taxonomy_sankey',
  source: 'taxonomy',
  nodes: [
    {
      name: 'phylum',
      label: 'Firmicutes',
      rank: 'phylum',
      depth: 0,
      value: 10,
      mergedCount: 0,
    },
    {
      name: 'phylum/other-species',
      label: 'Other species',
      rank: 'species',
      depth: 1,
      value: 3,
      mergedCount: 4,
    },
  ],
  links: [
    {
      source: 'phylum',
      target: 'phylum/other-species',
      value: 3,
    },
  ],
  layout: {
    width: 2200,
    height: 4800,
    nodeGap: 14,
    maxDepth: 3,
    maxColumnCount: 160,
  },
};

beforeEach(() => {
  mockEChartsProps.mockClear();
});

test('uses bounded rendering settings for dense sankey projections', () => {
  render(<TaxonomyChart data={sankeyPayload} mode="sankey" />);

  expect(screen.getByTestId('echarts')).toBeTruthy();
  const props = mockEChartsProps.mock.calls.at(-1)[0];
  expect(props.style.height).toBe(3040);
  expect(props.option.animation).toBe(false);
  expect(props.option.series[0].layoutIterations).toBe(16);
  expect(props.opts.renderer).toBe('canvas');
  expect(props.opts.devicePixelRatio).toBeLessThanOrEqual(1.5);
  expect(props.autoResize).toBe(false);
});

test('shows merged category counts in sankey tooltips', () => {
  render(<TaxonomyChart data={sankeyPayload} mode="sankey" />);

  const props = mockEChartsProps.mock.calls.at(-1)[0];
  const tooltip = props.option.tooltip.formatter({
    dataType: 'node',
    name: 'phylum/other-species',
    data: sankeyPayload.nodes[1],
  });
  expect(tooltip).toContain('Other species');
  expect(tooltip).toContain('合并小分类: 4');
});
