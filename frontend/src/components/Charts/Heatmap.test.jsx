import { render, screen } from '@testing-library/react';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useEffect: jest.fn(),
  };
});

jest.mock('d3', () => {
  function createSelection() {
    const selection = {
      selectAll: jest.fn(() => selection),
      remove: jest.fn(() => selection),
      attr: jest.fn(() => selection),
      append: jest.fn(() => selection),
      data: jest.fn(() => selection),
      join: jest.fn(() => selection),
      on: jest.fn(() => selection),
      style: jest.fn(() => selection),
      text: jest.fn(() => selection),
      html: jest.fn(() => selection),
    };
    return selection;
  }

  return {
    select: jest.fn(() => createSelection()),
    scaleSequential: jest.fn(() => {
      const scale = jest.fn(() => '#cccccc');
      scale.domain = jest.fn(() => scale);
      return scale;
    }),
    interpolateRdBu: jest.fn(),
    interpolateYlOrRd: jest.fn(),
  };
});

import Heatmap from './Heatmap';

const heatmapData = {
  filter: { pValueMax: 0.05, log2FcMinAbs: 1, maxFeatures: 200 },
  featureLabel: '物种',
  stats: [
    { fullName: 'k__Bacteria|p__A|c__A|g__A|s__A', p: 0.01, log2FC: 2 },
    { fullName: 'k__Bacteria|p__B|c__B|g__B|s__B', p: 0.02, log2FC: -3 },
  ],
  colLabels: ['A', 'B'],
  adMatrix: [[1, 2]],
  ncMatrix: [[2, 1]],
  diffMatrix: [[0.5, -0.5]],
  adLabels: ['AD1'],
  ncLabels: ['NC1'],
  diffLabels: ['AD - NC'],
  colOrder: [1, 0],
  maxV: 2,
  maxAbs: 0.5,
};

test('renders hierarchical column ordering without a K selector', () => {
  render(
    <Heatmap
      data={heatmapData}
      featureLabel="物种"
    />
  );

  expect(screen.queryByLabelText(/聚类数 K/)).toBeNull();
  expect(screen.queryByText('相同颜色 = 同一簇')).toBeNull();
  expect(screen.getByText(/列排序：/)).toBeTruthy();
});
