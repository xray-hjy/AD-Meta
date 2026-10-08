import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import PaginationControls, { buildPaginationItems } from './PaginationControls';

test('keeps a compact page window with ellipses', () => {
  expect(buildPaginationItems(5, 12)).toEqual([1, 'ellipsis-1-4', 4, 5, 6, 'ellipsis-6-12', 12]);
});

test('navigates with page buttons and a page-number jump', () => {
  const onPageChange = vi.fn();
  render(<PaginationControls page={5} pageCount={12} onPageChange={onPageChange} />);

  fireEvent.click(screen.getByRole('button', { name: '\u7b2c 6 \u9875' }));
  expect(onPageChange).toHaveBeenLastCalledWith(6);

  fireEvent.click(screen.getAllByRole('button', { name: '选择页码' })[1]);
  expect(screen.getByRole('dialog', { name: '选择页码' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('\u8df3\u81f3\u9875\u7801'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: '\u8df3\u8f6c' }));
  expect(onPageChange).toHaveBeenLastCalledWith(12);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('selects omitted pages and dismisses the picker with Escape or an outside pointer', () => {
  const onPageChange = vi.fn();
  render(<PaginationControls page={1} pageCount={40} onPageChange={onPageChange} />);
  const trigger = screen.getByRole('button', { name: '选择页码' });
  fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '第 7 页' }));
  expect(onPageChange).toHaveBeenLastCalledWith(7);
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
