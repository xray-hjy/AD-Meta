import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PaletteSelect from './PaletteSelect';

const field = { key: 'palette', label: '配色', description: '连续色系', options: [
  { value: 'blues', label: 'Blues · 单色蓝', colors: ['#ddeeff', '#123456'] },
  { value: 'viridis', label: 'Viridis · 紫绿黄', colors: ['#440154', '#fde725'] },
] };

test('palette list provides gradient previews, keyboard selection and focus return', () => {
  const onChange = vi.fn();
  render(<PaletteSelect field={field} value="blues" onChange={onChange} />);
  const trigger = screen.getByRole('button', { name: '配色' });
  fireEvent.click(trigger);
  const first = screen.getByRole('option', { name: /Blues/ });
  expect(first).toHaveFocus();
  expect(first.querySelector('.chart-palette-select__ramp').style.background).toContain('linear-gradient');
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /Viridis/ })).toHaveFocus();
  fireEvent.click(screen.getByRole('option', { name: /Viridis/ }));
  expect(onChange).toHaveBeenCalledWith('palette', 'viridis');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(trigger).toHaveFocus();
});

test('clicking outside dismisses the list without changing the chosen palette', () => {
  const onChange = vi.fn();
  render(<PaletteSelect field={field} value="blues" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '配色' }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
