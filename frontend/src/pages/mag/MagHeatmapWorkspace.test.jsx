import { selectOption } from '../../test/selectOption';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { getMagHeatmap } from '../../api/mag';
import MagHeatmapWorkspace from './MagHeatmapWorkspace';

vi.mock('../../api/mag', async original => ({ ...await original(), getMagHeatmap: vi.fn() }));
vi.mock('./MagCharts', () => ({ default: ({ data, onSelect }) => <div data-testid="heatmap" data-total-rows={data.magIds.length}>
  <button onClick={() => onSelect(data.magIds[0])}>查看热图 MAG</button>
</div> }));
const provenance = { version: 'prjca022804-ad-nc', dataFingerprint: 'fixture', groupCounts: { AD: 2, NC: 2 }, magCount: 872, testedFeatureCount: 872 };
const overview = { provenance, capabilities: { quality: true } };
const base = { provenance, magIds: ['MAG_A'], features: [{ magId: 'MAG_A', meanPercent: 1, qValue: 0.3 }],
  samples: [{ sampleId: 'S1', disease: 'AD', batch: '1' }], values: [[1]], settings: {}, methods: {}, selection: '丰度概览',
  selectionAudit: { sourceCount: 872, matchedCount: 872, displayedCount: 1, omittedCount: 871, exclusions: [] }, warnings: [] };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); getMagHeatmap.mockResolvedValue(base); });
function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MagHeatmapWorkspace overview={overview} params={{ revision: 'fixture', batch: '2' }} onSelect={vi.fn()} {...props} /></QueryClientProvider>);
}

test('analysis edits apply explicitly while style changes do not request a new selection', async () => {
  mount(); await screen.findByTestId('heatmap');
  const count = getMagHeatmap.mock.calls.length;
  selectOption(screen.getByLabelText('选行方式'), 'variance');
  selectOption(screen.getByLabelText('颜色含义'), 'rowZ');
  expect(getMagHeatmap).toHaveBeenCalledTimes(count);
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ heatmapMode: 'variance', colorMode: 'rowZ', batch: '2' }), expect.anything()));
  await screen.findByTestId('heatmap');
  expect(screen.getByRole('button', { name: '配色', exact: true })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '配色', exact: true }));
  expect(within(screen.getByRole('listbox', { name: '配色系列' })).getAllByRole('option')).toHaveLength(4);
  fireEvent.click(screen.getByRole('option', { name: /BrBG/ }));
  const requests = getMagHeatmap.mock.calls.length;
  fireEvent.click(screen.getByRole('switch', { name: '标签', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '交换横纵轴' }));
  expect(screen.getByRole('button', { name: '交换横纵轴' })).toHaveAttribute('aria-pressed', 'true');
  expect(getMagHeatmap).toHaveBeenCalledTimes(requests);
  expect(screen.queryByText(/不能用来比较不同 MAG/)).toBeNull();
});

test('saving uses applied settings and keeps the configuration through navigation', async () => {
  const first = mount(); await screen.findByTestId('heatmap');
  fireEvent.change(screen.getByLabelText('MAG ID / 分类搜索'), { target: { value: 'Species A' } });
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ heatmapQuery: 'Species A' }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  fireEvent.change(screen.getByLabelText('自定义热图 MAG 数量'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: '确认数量' }));
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  expect(JSON.parse(localStorage.getItem('admeta:mag:heatmap:fixture')).settings).toMatchObject({ heatmapQuery: 'Species A', topN: 20 });
  first.unmount(); mount();
  expect(screen.getByLabelText('MAG ID / 分类搜索')).toHaveValue('Species A');
  expect(screen.getByRole('button', { name: '显示 MAG 数' })).toHaveTextContent('20 个');
});

test('custom heatmap count is a draft until applying settings, including confirmation with Enter', async () => {
  mount(); await screen.findByTestId('heatmap');
  const requests = getMagHeatmap.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  const panel = screen.getByRole('dialog', { name: '热图 MAG 显示数量' });
  expect(panel.querySelector('form')).toBeNull();
  const input = within(panel).getByLabelText('自定义热图 MAG 数量');
  fireEvent.change(input, { target: { value: '37' } });
  expect(within(panel).getByText(/预计矩阵：37 个 MAG × 1 个样本/)).toBeVisible();
  expect(getMagHeatmap).toHaveBeenCalledTimes(requests);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '显示 MAG 数' })).toHaveTextContent('37 个');
  expect(getMagHeatmap).toHaveBeenCalledTimes(requests);
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 37 }), expect.anything()));
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  fireEvent.click(screen.getByRole('button', { name: '全部匹配', exact: true }));
  expect(screen.getByLabelText('自定义热图 MAG 数量')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '确认数量' }));
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 0 }), expect.anything()));
});

test('count hints track pending filters and allow recovery from zero matches', async () => {
  getMagHeatmap.mockResolvedValue({ ...base, magIds: [], features: [], selectionAudit: { ...base.selectionAudit, matchedCount: 0, displayedCount: 0 } });
  mount(); await screen.findByText(/没有符合当前条件的 MAG/);
  fireEvent.change(screen.getByLabelText('MAG ID / 分类搜索'), { target: { value: 'Roseburia' } });
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  expect(screen.getByText(/筛选条件待应用，匹配数将在应用后更新/)).toBeVisible();
  expect(screen.queryByText(/预计矩阵/)).toBeNull();
  fireEvent.change(screen.getByLabelText('自定义热图 MAG 数量'), { target: { value: '125' } });
  fireEvent.click(screen.getByRole('button', { name: '确认数量' }));
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));
  await waitFor(() => expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 125, heatmapQuery: 'Roseburia' }), expect.anything()));
});

test('invalid counts cannot be confirmed and cancelling keeps the previous count', async () => {
  mount(); await screen.findByTestId('heatmap');
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  for (const value of ['', '0', '-2', '1.5', '873']) {
    fireEvent.change(screen.getByLabelText('自定义热图 MAG 数量'), { target: { value } });
    expect(screen.getByRole('button', { name: '确认数量' })).toBeDisabled();
  }
  fireEvent.keyDown(screen.getByLabelText('自定义热图 MAG 数量'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '显示 MAG 数' })).toHaveTextContent('20 个');
});

test('future catalogs respect the numeric API limit while all matching remains available', async () => {
  getMagHeatmap.mockResolvedValue({ ...base, selectionAudit: { ...base.selectionAudit, sourceCount: 1500, matchedCount: 1200 } });
  mount(); await screen.findByTestId('heatmap');
  fireEvent.click(screen.getByRole('button', { name: '显示 MAG 数' }));
  expect(screen.getByLabelText('拖动选择热图 MAG 数量')).toHaveAttribute('max', '1000');
  fireEvent.change(screen.getByLabelText('自定义热图 MAG 数量'), { target: { value: '1001' } });
  expect(screen.getByRole('button', { name: '确认数量' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '全部匹配', exact: true }));
  expect(screen.getByText(/预计矩阵：1,200 个 MAG/)).toBeVisible();
  expect(screen.getByRole('button', { name: '确认数量' })).toBeEnabled();
});

test('empty candidates retain a usable filter form without inventing a fallback chart', async () => {
  getMagHeatmap.mockResolvedValue({ ...base, magIds: [], features: [], selectionAudit: { ...base.selectionAudit, matchedCount: 0, displayedCount: 0 } });
  mount();
  expect(await screen.findByText(/没有符合当前条件的 MAG/)).toBeVisible();
  expect(screen.queryByTestId('heatmap')).toBeNull();
  expect(screen.getByRole('button', { name: '应用设置' })).toBeVisible();
});

test('continuous heatmap retains the entire collection independently of table pages and folding', async () => {
  const magIds = Array.from({ length: 350 }, (_, i) => `MAG_${i}`);
  getMagHeatmap.mockResolvedValue({ ...base, magIds, features: magIds.map(magId => ({ magId })), selectionAudit: { ...base.selectionAudit, displayedCount: 350 } });
  mount(); await screen.findByTestId('heatmap');
  expect(screen.queryByRole('navigation', { name: '热图图形分段' })).toBeNull();
  expect(screen.getByTestId('heatmap')).toHaveAttribute('data-total-rows', '350');
  const tablePagination = screen.getByRole('navigation', { name: '热图 MAG 列表分页' });
  fireEvent.click(within(tablePagination).getByRole('button', { name: '下一页' }));
  expect(screen.getByTestId('heatmap')).toHaveAttribute('data-total-rows', '350');
  const table = screen.getByRole('region', { name: '热图 MAG 数据列表，可横向滚动' });
  expect(within(table).getByRole('button', { name: 'MAG_300', exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '收起MAG 样本丰度热图' }));
  expect(screen.getByTestId('heatmap')).not.toBeVisible();
  expect(table).toBeVisible();
});

test('adding the selected MAG opens the manual candidate view and retains the exact ID', async () => {
  const onSelect = vi.fn();
  mount({ initialMagId: 'MAG_A', onSelect }); await screen.findByTestId('heatmap');
  expect(screen.getByLabelText('选行方式')).toHaveTextContent('候选对比');
  expect(screen.getByLabelText('完整 MAG ID 清单')).toHaveValue('MAG_A');
  expect(getMagHeatmap).toHaveBeenLastCalledWith(expect.objectContaining({ candidateKind: 'manual', heatmapIds: 'MAG_A' }), expect.anything());
  fireEvent.click(screen.getByRole('button', { name: '查看热图 MAG' }));
  expect(onSelect).toHaveBeenCalledWith('MAG_A');
});
