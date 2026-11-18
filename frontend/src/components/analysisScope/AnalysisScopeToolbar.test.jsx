import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AnalysisScopeToolbar from './AnalysisScopeToolbar';

test('keeps custom sample selection before feature controls in the sidebar workflow', () => {
  const { container } = render(<AnalysisScopeToolbar scope={{ mode: 'subset', groups: [], sampleCodes: ['S1', 'S2'] }}
    topN={20} featureLabel="物种" samples={[{ sampleCode: 'S1', phenotype: 'AD' }, { sampleCode: 'S2', phenotype: 'NC' }]}
    samplesLoading={false} onChange={vi.fn()} chartControls={<div>对象池控件</div>} />);
  const picker = container.querySelector('.projection-subset-picker');
  const features = container.querySelector('.projection-controls__chart');
  expect(picker.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('button', { name: '应用范围' })).toBeEnabled();
});

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
