import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AnalysisTopNControl from './AnalysisTopNControl';

const control = { label: '展示 KO 数量', input: 'range', min: 1, max: 100, defaultValue: 20, presets: [10, 20, 50, 100], purpose: 'display' };
test('KO count accepts custom integers, waits for Apply, and respects projection limits', async () => {
  const changed = vi.fn();
  render(<AnalysisTopNControl control={control} value={20} featureLabel="KO" availableCount={6000} onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: '展示 KO 数量' }));
  const input = await screen.findByLabelText('自定义 Top N KO');
  fireEvent.change(input, { target: { value: '37' } });
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '全部匹配' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '101' } });
  expect(screen.getByRole('button', { name: '应用', exact: true })).toBeDisabled();
  fireEvent.change(input, { target: { value: '37' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(changed).toHaveBeenCalledExactlyOnceWith(37);
});
test('all matching uses the known count, never the unsupported zero sentinel', async () => {
  const changed = vi.fn();
  render(<AnalysisTopNControl control={control} value={20} featureLabel="KO" availableCount={23} onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: '展示 KO 数量' }));
  fireEvent.click(await screen.findByRole('button', { name: '全部匹配' }));
  fireEvent.click(screen.getByRole('button', { name: '应用', exact: true }));
  expect(changed).toHaveBeenCalledExactlyOnceWith(23);
});
test('PCA count explains recomputation and cannot masquerade as a display-only limit', async () => {
  render(<AnalysisTopNControl control={{ ...control, purpose: 'feature_selection', min: 2 }} value={20} featureLabel="物种" availableCount={50} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '展示 KO 数量' }));
  expect(await screen.findByText(/重新选取特征并计算结果/)).toBeVisible();
  expect(screen.queryByRole('button', { name: '全部匹配' })).toBeNull();
});
