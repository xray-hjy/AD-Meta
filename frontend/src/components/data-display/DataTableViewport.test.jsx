import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import DataTableViewport from './DataTableViewport';

test('owns the scrollable table viewport and exposes a shared sticky-header table class', () => {
  render(
    <DataTableViewport ariaLabel="测试数据表" footer="共 1 行">
      <thead><tr><th>名称</th></tr></thead>
      <tbody><tr><td>项目 A</td></tr></tbody>
    </DataTableViewport>
  );

  const viewport = screen.getByLabelText('测试数据表');
  expect(viewport).toHaveClass('data-table-viewport');
  expect(viewport.querySelector('table')).toHaveClass('data-table');
  expect(screen.getByText('共 1 行')).toHaveClass('data-table-viewport__footer');
});
