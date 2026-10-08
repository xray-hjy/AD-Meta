import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AnalysisScopeToolbar from './AnalysisScopeToolbar';

test('single sample autocomplete searches beyond the first 20 and commits only a confirmed sample code', async () => {
  const change = vi.fn();
  render(<AnalysisScopeToolbar scope={{ mode: 'cohort', groups: [], sampleCodes: [] }} topN={20} featureLabel="物种"
    samples={Array.from({ length: 185 }, (_, i) => ({ sampleCode: `CRR${i}`, phenotype: i % 2 ? 'NC' : 'AD' }))}
    samplesLoading={false} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: '单个样本', exact: true }));
  const input = screen.getByRole('combobox', { name: '选择样本', exact: true });
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'CRR184' } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('option', { name: /CRR184/ }));
  expect(change).toHaveBeenCalledWith({ mode: 'sample', groups: [], sampleCodes: ['CRR184'] }, 20, {});
});
