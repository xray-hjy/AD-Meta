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

import Heatmap, { buildCombinedHeatmapData, buildHeatmapLayout } from './Heatmap';

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
  combinedRowOrder: [1, 0],
  dendrograms: {
    metric: 'euclidean',
    linkage: 'average',
    rows: { merges: [[0, 1, 1.25, 2]] },
    columns: { merges: [[0, 1, 0.75, 2]] },
  },
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
  expect(screen.getByText('AD + NC 合并丰度热图（层次聚类）')).toBeTruthy();
  expect(screen.getByText('差异热图 (AD − NC 平均 log 丰度)')).toBeTruthy();

  expect(document.querySelectorAll('canvas')).toHaveLength(4);
  expect(document.querySelectorAll('svg rect')).toHaveLength(0);
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();

  const combinedCanvas = screen.getByLabelText('AD + NC 合并丰度热图（层次聚类）');
  expect(combinedCanvas.dataset.rowDendrogram).toBe('true');
  expect(combinedCanvas.dataset.columnDendrogram).toBe('true');
  expect(combinedCanvas.dataset.rowDendrogramPosition).toBe('right');
  expect(combinedCanvas.dataset.columnDendrogramPosition).toBe('bottom');
  expect(combinedCanvas.dataset.rowGroups).toBe('NC,AD');
});

test('places combined dendrograms to the right and below the heatmap grid', () => {
  const layout = buildHeatmapLayout({
    rows: 2,
    cols: 2,
    compact: true,
    showDendrograms: true,
  });
  const gridRight = layout.L.left + layout.gridW;
  const gridBottom = layout.L.top + layout.gridH;

  expect(layout.dendro.rowTreeLeft).toBeGreaterThanOrEqual(gridRight);
  expect(layout.dendro.rowTreeRight).toBeGreaterThan(layout.dendro.rowTreeLeft);
  expect(layout.dendro.columnTreeTop).toBeGreaterThanOrEqual(gridBottom);
  expect(layout.dendro.columnTreeBottom).toBeGreaterThan(layout.dendro.columnTreeTop);
  expect(layout.legendX).toBeGreaterThan(layout.dendro.rowTreeRight);
});

test('builds the combined matrix in the shared sample-cluster order', () => {
  const orderedData = {
    stats: [heatmapData.stats[1], heatmapData.stats[0]],
    colLabels: ['B', 'A'],
    adMatrix: [[2, 1]],
    ncMatrix: [[1, 2]],
  };

  const combined = buildCombinedHeatmapData(heatmapData, orderedData);

  expect(combined.matrix).toEqual([[1, 2], [2, 1]]);
  expect(combined.rowLabels).toEqual(['NC1', 'AD1']);
  expect(combined.rowGroups).toEqual(['NC', 'AD']);
  expect(combined.rowLeafOrder).toEqual([1, 0]);
  expect(combined.columnLeafOrder).toEqual([1, 0]);
});

test('shows the clustered sample group in the combined heatmap tooltip', () => {
  render(<Heatmap data={heatmapData} featureLabel="物种" />);

  const canvas = screen.getByLabelText('AD + NC 合并丰度热图（层次聚类）');
  const layout = buildHeatmapLayout({
    rows: 2,
    cols: 2,
    compact: true,
    showDendrograms: true,
  });
  canvas.getBoundingClientRect = jest.fn(() => ({
    left: 0,
    top: 0,
    width: layout.totalW,
    height: layout.totalH,
    right: layout.totalW,
    bottom: layout.totalH,
  }));

  fireEvent.mouseMove(canvas, {
    clientX: layout.L.left + layout.L.cellW / 2,
    clientY: layout.L.top + layout.ch / 2,
  });

  expect(document.body.textContent).toContain('样本: NC1');
  expect(document.body.textContent).toContain('分组: NC');
});

test('keeps the original panels and prompts for recompute when dendrogram metadata is absent', () => {
  const legacyData = { ...heatmapData };
  delete legacyData.combinedRowOrder;
  delete legacyData.dendrograms;

  render(<Heatmap data={legacyData} featureLabel="物种" />);

  expect(document.querySelectorAll('canvas')).toHaveLength(3);
  expect(screen.getByText('合并聚类热图需要重新预计算数据')).toBeTruthy();
  expect(screen.getByText('AD 组丰度热图')).toBeTruthy();
  expect(screen.getByText('NC 组丰度热图')).toBeTruthy();
  expect(screen.getByText('差异热图 (AD − NC 平均 log 丰度)')).toBeTruthy();
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
