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
      append: jest.fn(() => selection),
      attr: jest.fn(() => selection),
      call: jest.fn(fn => {
        if (typeof fn === 'function') fn(selection);
        return selection;
      }),
      data: jest.fn(() => selection),
      join: jest.fn(() => selection),
      remove: jest.fn(() => selection),
      select: jest.fn(() => selection),
      selectAll: jest.fn(() => selection),
      text: jest.fn(() => selection),
    };
    return selection;
  }

  const axis = jest.fn(() => {});
  axis.ticks = jest.fn(() => axis);
  axis.tickSize = jest.fn(() => axis);
  axis.tickFormat = jest.fn(() => axis);

  return {
    select: jest.fn(() => createSelection()),
    scaleLinear: jest.fn(() => {
      let domain = [0, 1];
      let range = [0, 1];
      const scale = jest.fn(value => {
        const ratio = (Number(value) - domain[0]) / (domain[1] - domain[0] || 1);
        return range[0] + ratio * (range[1] - range[0]);
      });
      scale.domain = jest.fn(next => {
        domain = next;
        return scale;
      });
      scale.range = jest.fn(next => {
        range = next;
        return scale;
      });
      return scale;
    }),
    axisBottom: jest.fn(() => axis),
    format: jest.fn(() => value => `${Math.round(Number(value) * 100)}%`),
  };
});

import PhylumChart from './PhylumChart';

const compositionData = [
  { phylum: 'Bacteroidota', adRatio: 0.45, ncRatio: 0.30 },
  { phylum: 'Firmicutes', adRatio: 0.35, ncRatio: 0.50 },
  { phylum: 'Proteobacteria', adRatio: 0.20, ncRatio: 0.20 },
];

test('renders taxonomy composition summary cards', () => {
  render(<PhylumChart data={compositionData} featureKind="taxonomy" featureLabel="物种" />);

  expect(screen.getByText('门级组成概览')).toBeTruthy();
  expect(screen.getByText('展示项数')).toBeTruthy();
  expect(screen.getByText('3 项')).toBeTruthy();
  expect(screen.getByText('AD 最高')).toBeTruthy();
  expect(screen.getByText('NC 最高')).toBeTruthy();
  expect(screen.getByText('最大组间差异')).toBeTruthy();
  expect(screen.getAllByText('Bacteroidota').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Firmicutes').length).toBeGreaterThan(0);
  expect(screen.getByText('AD 高 15.0 pp')).toBeTruthy();
});

test('renders KO composition summary cards with KO labels', () => {
  render(
    <PhylumChart
      data={[
        { phylum: 'K03088', adRatio: 0.15, ncRatio: 0.08 },
        { phylum: 'K21572', adRatio: 0.10, ncRatio: 0.18 },
      ]}
      featureKind="ko"
      featureLabel="KO"
    />
  );

  expect(screen.getByText('KO 功能组成概览')).toBeTruthy();
  expect(screen.getByText('Top KO 功能')).toBeTruthy();
  expect(screen.getByText('K03088')).toBeTruthy();
  expect(screen.getAllByText('K21572').length).toBeGreaterThan(0);
  expect(screen.getByText('NC 高 8.0 pp')).toBeTruthy();
});
