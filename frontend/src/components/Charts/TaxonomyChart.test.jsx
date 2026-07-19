import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ColorVisionProvider } from '../../context/ColorVisionContext';
import TaxonomyChart from './TaxonomyChart';

const mockEChartsProps = vi.hoisted(() => vi.fn());

vi.mock('./TaxonomyEChart', () => ({
  __esModule: true,
  default: props => {
    const React = require('react');
    mockEChartsProps(props);
    return React.createElement('div', { 'data-testid': 'echarts' });
  },
}));

vi.mock('../../hooks/useAvailableViewport', () => ({
  default: () => ({ width: 1228, height: 1180 }),
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

const sunburstPayload = [
  {
    name: 'Bacteroidota',
    value: 10,
    children: [
      { name: 'Bacteroidia', value: 8 },
      { name: 'Other classes', value: 2 },
    ],
  },
];

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
  expect(props.option.aria.decal.show).toBe(true);
  expect(props.option.aria.decal.decals).toHaveLength(3);
  expect(props.option.hoverLayerThreshold).toBe(1);
  expect(props.option.series[0].emphasis.focus).toBe('adjacency');
  expect(props.option.tooltip.transitionDuration).toBe(0);
});

test('keeps adjacency emphasis and removes only decals when color-blind mode is off', () => {
  render(
    <ColorVisionProvider initialEnabled={false}>
      <TaxonomyChart data={sankeyPayload} mode="sankey" />
    </ColorVisionProvider>
  );

  const props = mockEChartsProps.mock.calls.at(-1)[0];
  expect(props.option.series[0].emphasis.focus).toBe('adjacency');
  expect(props.option.aria.decal.show).toBe(false);
});

test('keeps ancestor emphasis and the reusable color-blind palette on the sunburst', () => {
  render(<TaxonomyChart data={sunburstPayload} mode="sunburst" />);

  const props = mockEChartsProps.mock.calls.at(-1)[0];
  expect(props.option.hoverLayerThreshold).toBe(1);
  expect(props.option.series[0].emphasis.focus).toBe('ancestor');
  expect(props.option.aria.decal.show).toBe(true);
  expect(props.option.aria.decal.decals).toHaveLength(3);
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
