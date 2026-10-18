import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AnalysisRunSelect from './AnalysisRunSelect';
import { getSelectableRuns, selectAnalysisRun } from './analysisRunSelection';

const runs = [
  { key: 'transition', name: '过渡记录', selectorVisible: false },
  { key: 'old', name: 'AD/NC 群落分析（旧版）', selectorVisible: true },
  { key: 'new', name: 'AD/NC 群落分析', selectorVisible: true, isDefault: true },
];

test('explicit result, configured default and unknown result use separate selection rules', () => {
  expect(selectAnalysisRun(runs, '')?.key).toBe('new');
  expect(selectAnalysisRun(runs, 'unknown')?.key).toBe('new');
  expect(selectAnalysisRun(runs, 'old')?.key).toBe('old');
  expect(selectAnalysisRun(runs, 'transition')?.key).toBe('transition');
  expect(selectAnalysisRun([], '')).toBeNull();
  expect(selectAnalysisRun([{ key: 'future' }], '')?.key).toBe('future');
  expect(selectAnalysisRun([{ key: 'hidden', selectorVisible: false }], '')).toBeNull();
  expect(getSelectableRuns(runs).map(run => run.key)).toEqual(['old', 'new']);
});

test.each(['new', 'transition'])('selector contains only two choices while %s is displayed', async value => {
  const changed = vi.fn();
  render(<AnalysisRunSelect runs={runs} value={value} onChange={changed} />);
  const trigger = screen.getByRole('combobox', { name: '选择分析运行' });
  expect(trigger).toHaveTextContent(runs.find(run => run.key === value).name);
  fireEvent.click(trigger);
  const options = await screen.findAllByRole('option');
  expect(options.map(option => option.textContent.replace('✓', ''))).toEqual(['AD/NC 群落分析（旧版）', 'AD/NC 群落分析']);
  const old = screen.getByRole('option', { name: 'AD/NC 群落分析（旧版）', exact: true });
  fireEvent.pointerDown(old, { pointerType: 'mouse', button: 0 });
  fireEvent.click(old);
  expect(changed).toHaveBeenCalledWith('old');
});
