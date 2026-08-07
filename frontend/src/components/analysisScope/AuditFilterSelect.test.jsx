import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AuditFilterSelect from './AuditFilterSelect';

const baseProps = {
  id: 'feature-filter',
  label: '特征',
  emptyLabel: '全部特征',
  value: '',
  options: [
    { value: 'K00001', label: 'K00001' },
    { value: 'K00002', label: 'K00002' },
  ],
  loading: false,
  search: '',
  onSearch: vi.fn(),
  onChange: vi.fn(),
  onOpen: vi.fn(),
  optionLabel: option => option.label,
};

test('uses one tab stop and standard listbox arrow-key selection', () => {
  const onChange = vi.fn();
  render(<AuditFilterSelect {...baseProps} onChange={onChange} />);

  const trigger = screen.getByLabelText('特征');
  fireEvent.click(trigger);
  const search = screen.getByRole('searchbox', { name: '搜索特征' });
  const listbox = screen.getByRole('listbox', { name: '特征选项' });
  const options = screen.getAllByRole('option');

  expect(listbox).toHaveAttribute('tabindex', '0');
  options.forEach(option => expect(option).toHaveAttribute('tabindex', '-1'));

  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(listbox).toHaveFocus();
  expect(listbox).toHaveAttribute('aria-activedescendant', 'feature-filter-listbox-option-1');

  fireEvent.keyDown(listbox, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('K00001');
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('escape closes the listbox and restores trigger focus', () => {
  render(<AuditFilterSelect {...baseProps} />);
  const trigger = screen.getByLabelText('特征');
  fireEvent.click(trigger);

  fireEvent.keyDown(screen.getByRole('searchbox', { name: '搜索特征' }), { key: 'Escape' });

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
