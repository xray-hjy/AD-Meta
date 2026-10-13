import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { vi } from 'vitest';
import EntityAutocomplete, { EntityCombobox } from './EntityAutocomplete';

const items = [{ key: 'taxon:a', value: 'Species alpha', label: 'Species alpha', detail: '2 个代表 MAG · 分类名称检索', kind: '分类' },
  { key: 'mag:a', value: 'MAG_A', label: 'Species alpha', detail: 'MAG_A', kind: '代表 MAG' }];
function Search({ onSelect, onSubmit }) {
  const [value, setValue] = useState('');
  return <form onSubmit={event => { event.preventDefault(); onSubmit(value); }}><EntityAutocomplete label="MAG 搜索" value={value} onChange={setValue} onSelect={onSelect} items={items} />
    <button>搜索</button></form>;
}
test('typing and navigation do not apply; confirming a suggestion does, without submitting twice', async () => {
  const select = vi.fn(), submit = vi.fn(); render(<Search onSelect={select} onSubmit={submit} />);
  const input = screen.getByRole('combobox', { name: 'MAG 搜索', exact: true });
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'Species' } });
  expect(select).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  await screen.findAllByRole('option');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(select).toHaveBeenCalledWith('Species alpha', items[0]));
  expect(submit).not.toHaveBeenCalled(); expect(input).toHaveValue('Species alpha');
  fireEvent.click(screen.getByRole('button', { name: '清空MAG 搜索' }));
  expect(input).toHaveValue('');
});
test('IME confirmation cannot select a candidate or submit a query', async () => {
  const select = vi.fn(), submit = vi.fn(); render(<Search onSelect={select} onSubmit={submit} />);
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: '物种' } });
  await screen.findAllByRole('option');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.compositionEnd(input);
  expect(select).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});
test('known entity selection rejects custom IDs, restores the selection on blur and searches full catalogs', async () => {
  const change = vi.fn();
  const entries = [...items.slice(1), { key: 'mag:b', value: 'MAG_B', label: 'Species beta', detail: 'MAG_B', kind: '代表 MAG' }];
  render(<><EntityCombobox label="选择 MAG" entries={entries} value="MAG_A" onChange={change} /><button>其他</button></>);
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'INVALID' } }); fireEvent.click(screen.getByText('其他')); fireEvent.blur(input);
  expect(change).not.toHaveBeenCalled();
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'beta' } });
  const option = await screen.findByRole('option', { name: /Species beta/ });
  fireEvent.click(option); expect(change).toHaveBeenCalledWith('MAG_B');
});

test('the first typed query that opens a fixed entity picker is retained', async () => {
  const entries = [{ ...items[1] }, { key: 'mag:b', value: 'MAG_B', label: 'Species beta', detail: 'MAG_B', kind: '代表 MAG' }];
  render(<EntityCombobox label="选择 MAG" entries={entries} value="MAG_A" onChange={vi.fn()} />);
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  fireEvent.input(input, { inputType: 'insertText', target: { value: 'beta' } });
  expect(await screen.findByRole('option', { name: /Species beta/ })).toBeVisible();
  expect(screen.queryByRole('option', { name: /Species alpha/ })).toBeNull();
});

test('free keywords remain submittable without choosing a candidate', () => {
  const select = vi.fn(), submit = vi.fn(); render(<Search onSelect={select} onSubmit={submit} />);
  const input = screen.getByRole('combobox');
  const submitButton = screen.getByRole('button', { name: '搜索', exact: true });
  fireEvent.input(input, { inputType: 'insertText', target: { value: '自由关键词' } });
  fireEvent.click(submitButton);
  expect(submit).toHaveBeenCalledWith('自由关键词');
  expect(select).not.toHaveBeenCalled();
});

