import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('d3', () => ({
  select: node => ({
    style(prop, value) {
      if (node?.style) node.style[prop] = value;
      return this;
    },
    html(value) {
      if (node) node.innerHTML = value;
      return this;
    },
  }),
  scaleSequential: jest.fn(() => {
    const scale = jest.fn(() => '#cccccc');
    scale.domain = jest.fn(() => scale);
    return scale;
  }),
  interpolateRdBu: jest.fn(),
  interpolateYlOrRd: jest.fn(),
}));

import Heatmap from './Heatmap';

const mockContext = {
  beginPath: jest.fn(),
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  fillText: jest.fn(),
  lineTo: jest.fn(),
  moveTo: jest.fn(),
  restore: jest.fn(),
  rotate: jest.fn(),
  save: jest.fn(),
  setTransform: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
};

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: jest.fn(() => mockContext),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: jest.fn(() => 'data:image/png;base64,heatmap-preview'),
  });
  window.requestAnimationFrame = jest.fn(() => 1);
  window.cancelAnimationFrame = jest.fn();
});

beforeEach(() => {
  Object.values(mockContext).forEach(fn => fn.mockClear?.());
  HTMLCanvasElement.prototype.getContext.mockClear();
  HTMLCanvasElement.prototype.toDataURL.mockClear();
  window.requestAnimationFrame.mockClear();
});

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

function firstCanvas() {
  return document.querySelector('canvas');
}

test('renders heatmap panels as canvas instead of SVG rect grids', () => {
  render(<Heatmap data={heatmapData} featureLabel="物种" />);

  expect(screen.queryByLabelText(/聚类数 K/)).toBeNull();
  expect(screen.queryByText('相同颜色 = 同一簇')).toBeNull();
  expect(screen.getByText(/列排序：/)).toBeTruthy();
  expect(screen.getByText('AD 组丰度热图')).toBeTruthy();
  expect(screen.getByText('NC 组丰度热图')).toBeTruthy();
  expect(screen.getByText('差异热图 (AD − NC 平均 log 丰度)')).toBeTruthy();

  expect(document.querySelectorAll('canvas')).toHaveLength(3);
  expect(document.querySelectorAll('svg rect')).toHaveLength(0);
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
});

test('shows tooltip content by resolving the hovered canvas cell', () => {
  render(<Heatmap data={heatmapData} featureLabel="物种" />);

  const canvas = firstCanvas();
  canvas.getBoundingClientRect = jest.fn(() => ({
    left: 0,
    top: 0,
    width: 213,
    height: 120,
    right: 213,
    bottom: 120,
  }));

  fireEvent.mouseMove(canvas, {
    clientX: 118,
    clientY: 68,
  });

  expect(document.body.textContent).toContain('样本: AD1');
  expect(document.body.textContent).toContain('log10(丰度+1) = 2.0000');
  expect(document.body.textContent).toContain('p = 0.020');
  expect(document.body.textContent).toContain('log2FC = -3.000');
});

test('opens a performant image lightbox from a canvas snapshot', () => {
  render(<Heatmap data={heatmapData} featureLabel="物种" />);

  fireEvent.click(firstCanvas());

  expect(screen.getByRole('img', { name: 'AD 组丰度热图 放大预览' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '放大' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '缩小' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '重置' })).toBeTruthy();
  expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');

  fireEvent.click(screen.getByRole('button', { name: '放大' }));
  expect(window.requestAnimationFrame).toHaveBeenCalled();
});

test('zooms the lightbox around the mouse cursor on wheel', () => {
  render(<Heatmap data={heatmapData} featureLabel="物种" />);

  fireEvent.click(firstCanvas());

  const image = screen.getByRole('img', { name: 'AD 组丰度热图 放大预览' });
  const content = image.parentElement;
  const viewport = content.parentElement;
  viewport.getBoundingClientRect = jest.fn(() => ({
    left: 100,
    top: 50,
    width: 1000,
    height: 800,
    right: 1100,
    bottom: 850,
  }));

  fireEvent.wheel(viewport, {
    clientX: 350,
    clientY: 250,
    deltaY: -100,
  });
  const scheduledFrame = window.requestAnimationFrame.mock.calls.at(-1)[0];
  scheduledFrame();

  expect(window.requestAnimationFrame).toHaveBeenCalled();
  expect(content.style.transform).toBe('translate(50px, 40px) scale(1.2)');
});
