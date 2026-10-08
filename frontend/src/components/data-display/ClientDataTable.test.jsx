import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import ClientDataTable from './ClientDataTable';

test('pages all chart rows, retains the expansion setting across pages, and resets when data changes', () => {
  const rows = Array.from({ length: 650 }, (_, index) => `记录 ${index + 1}`);
  const table = data => <ClientDataTable rows={data} ariaLabel="图表记录"
    renderRow={(row, index) => <tr key={index}><td>{row}</td></tr>}>
    <thead><tr><th>名称</th></tr></thead>
  </ClientDataTable>;
  const view = render(table(rows));
  const viewport = screen.getByLabelText('图表记录');
  expect(viewport).toHaveAttribute('data-visible-rows', '20');
  expect(viewport.querySelectorAll('tbody tr')).toHaveLength(300);
  fireEvent.click(screen.getByRole('button', { name: '展开至300行' }));
  fireEvent.click(screen.getByRole('button', { name: '第 2 页' }));
  expect(viewport).toHaveAttribute('data-visible-rows', '300');
  expect(screen.getByText('记录 301')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '第 3 页' }));
  expect(viewport.querySelectorAll('tbody tr')).toHaveLength(50);
  expect(viewport).toHaveAttribute('data-visible-rows', '50');
  expect(screen.getByText('记录 650')).toBeInTheDocument();
  view.rerender(table(rows.slice(0, 350)));
  expect(screen.getByText('记录 1')).toBeInTheDocument();
  expect(viewport.querySelectorAll('tbody tr')).toHaveLength(300);
});
