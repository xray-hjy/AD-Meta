import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import BoxplotFeatureSelector from './BoxplotFeatureSelector';

const { scopedFeatures } = vi.hoisted(() => ({ scopedFeatures: vi.fn() }));
vi.mock('../../hooks/useScopedFeatures', () => ({ default: (...args) => scopedFeatures(...args) }));
const scope = { mode: 'cohort', groups: [], sampleCodes: [] };
const candidates = ['Alpha_species', 'Beta_species'].map((name, index) => ({
  featureId: `feature-${index}`, fullName: `k__Bacteria|s__${name}`, shortName: name,
  rank: index + 1, detectedSampleCount: 8 - index, prevalence: .8 - index * .1,
}));
const ranked = { mode: 'ranked', ranking: 'mean_abundance', limit: 30, items: [] };

function Selector({ initial = ranked, ...props }) {
  const [value, setValue] = useState(initial);
  return <BoxplotFeatureSelector runKey="run" artifactKey="artifact" scope={scope} value={value} onChange={setValue} {...props} />;
}

beforeEach(() => { scopedFeatures.mockReset(); scopedFeatures.mockReturnValue({
  data: { items: candidates, total: 2, sourceFeatureCount: 9460 }, loading: false, fetching: false, error: null,
}); });

test('retains ranked presets and starts a custom pool empty, with explicit import of plotted objects', () => {
  render(<Selector plottedItems={candidates} />);
  expect(screen.getByLabelText('参与计算的物种数')).toHaveTextContent('Top 30');
  expect(screen.getByText(/平均丰度降序排名，包含零值/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '自定义物种' }));
  expect(screen.getByText('对象池 0 个物种')).toBeVisible();
  expect(screen.getByText(/从上方加入第一个物种/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '添加到对象池 Alpha_species' }));
  expect(screen.getByText('对象池 1 个物种')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '将当前图表对象加入池' }));
  expect(screen.getByText('对象池 2 个物种')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '将当前图表对象加入池' }));
  expect(screen.getByText('对象池 2 个物种')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '按丰度排名' }));
  expect(screen.getByText(/已保留的自定义对象池：2 个/)).toBeVisible();
});

test('separates pool membership, draft plotting, and the actual rendered collection', () => {
  render(<Selector initial={{ ...ranked, mode: 'explicit', items: candidates }} plottedItems={[candidates[0]]} isDirty dirtyCount={2} />);
  expect(screen.getByText('当前图表 1 个物种')).toBeVisible();
  expect(screen.getByText('待绘图 2 个')).toBeVisible();
  expect(screen.getByText('有 2 项修改尚未应用')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: '参与绘图 Alpha_species' }));
  expect(screen.getByText('待绘图 1 个')).toBeVisible();
  expect(screen.getByText('对象池 2 个物种')).toBeVisible();
  expect(screen.getByText('当前图表 1 个物种')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '从对象池移除 Alpha_species' }));
  expect(screen.getByText('对象池 1 个物种')).toBeVisible();
});

test('filters only the pool and batch toggles remain explicit about covering the entire pool', () => {
  render(<Selector initial={{ ...ranked, mode: 'explicit', items: candidates }} isDirty />);
  fireEvent.change(screen.getByRole('searchbox', { name: '池内搜索' }), { target: { value: 'Alpha' } });
  const pool = screen.getByRole('list', { name: '对象池列表' });
  expect(within(pool).getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '全池暂不绘图' }));
  expect(screen.getByText('待绘图 0 个')).toBeVisible();
  expect(screen.getByRole('button', { name: '应用选择' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '全池参与绘图' }));
  expect(screen.getByText('待绘图 2 个')).toBeVisible();
  expect(screen.getByRole('button', { name: '应用选择' })).toBeEnabled();
  expect(screen.getByText('对象池 2 个物种')).toBeVisible();
});

test('paginates the complete candidate catalog and resets the offset when search or scope changes', async () => {
  scopedFeatures.mockImplementation((_run, _artifact, request) => ({ data: { items: candidates, total: 120 }, fetching: false,
    ...request.query && { data: { items: candidates.slice(0, 1), total: 1 } } }));
  const { rerender } = render(<Selector initial={{ ...ranked, mode: 'explicit' }} />);
  fireEvent.click(screen.getByRole('button', { name: '下一页候选' }));
  expect(scopedFeatures.mock.calls.at(-1)[2].offset).toBe(50);
  fireEvent.change(screen.getByLabelText('检索全部物种', { selector: 'input' }), { target: { value: 'Alpha' } });
  await waitFor(() => expect(scopedFeatures.mock.calls.at(-1)[2]).toEqual(expect.objectContaining({ query: 'Alpha', offset: 0 })));
  expect(screen.getByRole('button', { name: '下一页候选' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('检索全部物种', { selector: 'input' }), { target: { value: '' } });
  await waitFor(() => expect(scopedFeatures.mock.calls.at(-1)[2].query).toBe(''));
  fireEvent.click(screen.getByRole('button', { name: '下一页候选' }));
  rerender(<Selector initial={{ ...ranked, mode: 'explicit' }} scope={{ mode: 'group', groups: ['AD'], sampleCodes: [] }} />);
  expect(scopedFeatures.mock.calls.at(-1)[2].offset).toBe(0);
});

test('does not expose stale candidates while a page is loading or a query has failed', () => {
  scopedFeatures.mockReturnValue({ data: { items: candidates, total: 120 }, placeholder: true, fetching: true });
  const { rerender } = render(<Selector initial={{ ...ranked, mode: 'explicit' }} />);
  expect(screen.queryByRole('button', { name: '添加到对象池 Alpha_species' })).toBeNull();
  expect(screen.getByRole('button', { name: '下一页候选' })).toBeDisabled();
  scopedFeatures.mockReturnValue({ data: { items: candidates, total: 120 }, error: 'offline', fetching: false });
  rerender(<Selector initial={{ ...ranked, mode: 'explicit' }} />);
  expect(screen.getByText('候选物种加载失败：offline')).toBeVisible();
  expect(screen.queryByRole('button', { name: '添加到对象池 Alpha_species' })).toBeNull();
});

test('keeps complete identity accessible and routes apply and undo through the existing callbacks', () => {
  const onApply = vi.fn(), onReset = vi.fn();
  render(<Selector initial={{ ...ranked, mode: 'explicit', items: [candidates[0]] }} isDirty onApply={onApply} onReset={onReset} />);
  const pool = screen.getByRole('list', { name: '对象池列表' });
  fireEvent.click(within(pool).getByText('完整名称与 ID'));
  expect(within(pool).getByText(candidates[0].fullName)).toBeVisible();
  expect(within(pool).getByText(candidates[0].featureId)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '应用选择' }));
  fireEvent.click(screen.getByRole('button', { name: '撤销未应用修改' }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onReset).toHaveBeenCalledOnce();
});

test('reports calculation failure against the rendered result rather than claiming a new selection was applied', () => {
  render(<Selector initial={{ ...ranked, mode: 'explicit', items: candidates }} plottedItems={[candidates[0]]} refreshError="offline" />);
  expect(screen.getByText('当前图表 1 个物种')).toBeVisible();
  expect(screen.getByText('计算失败，图表仍为上一版本；请在右侧重试')).toBeVisible();
  expect(screen.queryByText('选择已应用')).toBeNull();
});
