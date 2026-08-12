import { fireEvent, render, screen } from '@testing-library/react';
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

  fireEvent.change(screen.getByLabelText('\u8df3\u81f3\u9875\u7801'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: '\u8df3\u8f6c' }));
  expect(onPageChange).toHaveBeenLastCalledWith(12);
});
