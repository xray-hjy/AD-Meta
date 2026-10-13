import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { vi } from 'vitest';
import * as api from '../../api/mag';
import MagSearchInput, { MagCandidateInput } from './MagSearchInput';

vi.mock('../../api/mag', async original => ({ ...await original(), getMagCatalog: vi.fn(), getMagSuggestions: vi.fn() }));
function mount(child) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); api.getMagCatalog.mockResolvedValue({ items: [{ magId: 'MAG_Z', taxonomy: { species: 'Species Z' } }] }); });
test('manual candidates use stable IDs, deduplicate, remove, and retain editable bulk input', async () => {
  const update = vi.fn();
  function Host() {
    const [value, setValue] = useState('MAG_A');
    return <MagCandidateInput revision="rev1" value={value} onChange={next => { setValue(next); update(next); }} />;
  }
  mount(<Host />);
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'Species Z' } });
  fireEvent.click(await screen.findByRole('option', { name: /Species Z/ }));
  expect(update).toHaveBeenLastCalledWith('MAG_A\nMAG_Z');
  expect(input).toHaveValue('');
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'MAG_Z' } });
  fireEvent.click(await screen.findByRole('option', { name: /Species Z/ }));
  expect(update).toHaveBeenLastCalledWith('MAG_A\nMAG_Z');
  fireEvent.click(screen.getByRole('button', { name: '移除 MAG_A' }));
  expect(update).toHaveBeenLastCalledWith('MAG_Z');
});
test('remote lookup debounces, cancels obsolete requests, and never displays stale candidates', async () => {
  let oldResolve, oldSignal;
  api.getMagSuggestions.mockImplementation((params, { signal }) => {
    if (params.query === 'old') { oldSignal = signal; return new Promise(resolve => { oldResolve = resolve; }); }
    return Promise.resolve({ total: 1, items: [{ key: params.query, value: params.query, label: params.query, detail: params.query, kind: '分类' }] });
  });
  function Host() { const [value, setValue] = useState('old'); return <MagSearchInput revision="rev" context="crosswalk" label="映射检索" value={value} onChange={setValue} />; }
  mount(<Host />);
  fireEvent.click(screen.getByRole('button', { name: '映射检索候选' }));
  await waitFor(() => expect(oldSignal).toBeDefined());
  const input = screen.getByRole('combobox');
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'new' } });
  expect(api.getMagSuggestions.mock.calls.some(([params]) => params.query === 'new')).toBe(false);
  await screen.findByRole('option', { name: /new/ });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => oldResolve({ total: 1, items: [{ key: 'old', value: 'old', label: 'old', detail: 'old', kind: '分类' }] }));
  expect(screen.queryByRole('option', { name: /old/ })).toBeNull();
});
