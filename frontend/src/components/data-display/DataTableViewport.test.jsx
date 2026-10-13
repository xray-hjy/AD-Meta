import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
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

function Rows({ count }) {
  return <><thead><tr><th>名称</th></tr></thead><tbody>{Array.from({ length: count }, (_, index) => <tr key={index}><td>项目 {index}</td></tr>)}</tbody></>;
}

test('defaults to 20 rows, remembers the dragged maximum, and caps expansion at 300', () => {
  render(<DataTableViewport ariaLabel="可调整表格" resizable pagination={<span>分页</span>}><Rows count={320} /></DataTableViewport>);
  const viewport = screen.getByLabelText('可调整表格');
  const grip = screen.getByRole('button', { name: '拖动设置最大展示行数' });
  expect(viewport).toHaveAttribute('data-visible-rows', '20');
  fireEvent(grip, new MouseEvent('pointerdown', { button: 0, clientY: 100, bubbles: true }));
  fireEvent(grip, new MouseEvent('pointermove', { clientY: 820, bubbles: true }));
  fireEvent(grip, new MouseEvent('pointerup', { bubbles: true }));
  expect(viewport).toHaveAttribute('data-visible-rows', '40');
  fireEvent.click(screen.getByRole('button', { name: '收起至20行' }));
  expect(viewport).toHaveAttribute('data-visible-rows', '20');
  fireEvent.click(screen.getByRole('button', { name: '展开至40行' }));
  expect(viewport).toHaveAttribute('data-visible-rows', '40');
  fireEvent.keyDown(grip, { key: 'End' });
  fireEvent.keyDown(grip, { key: 'ArrowDown' });
  expect(viewport).toHaveAttribute('data-visible-rows', '300');
  expect(screen.getByText('分页').closest('.data-query-table__bar')).toContainElement(grip);
});

test('shows every available row on a short page and disables unnecessary expansion', () => {
  const result = render(<DataTableViewport ariaLabel="末页表格" resizable><Rows count={72} /></DataTableViewport>);
  fireEvent.click(screen.getByRole('button', { name: '展开至72行' }));
  expect(screen.getByLabelText('末页表格')).toHaveAttribute('data-visible-rows', '72');
  result.rerender(<DataTableViewport ariaLabel="末页表格" resizable><Rows count={8} /></DataTableViewport>);
  expect(screen.getByLabelText('末页表格')).toHaveAttribute('data-visible-rows', '8');
  expect(screen.getByRole('button', { name: '收起至20行' })).toBeDisabled();
});

test('keeps resizing and scrolls the containing page while held at either edge, then stops on release', () => {
  let nextId = 0;
  let time = 0;
  const frames = new Map();
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback);
    return nextId;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
  const advance = count => {
    for (let i = 0; i < count; i++) {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => { time += 16; callbacks.forEach(callback => callback(time)); });
    }
  };
  try {
    render(<main data-testid="page-scroll" style={{ overflowY: 'auto' }}><DataTableViewport ariaLabel="边缘拖拽表格" resizable><Rows count={72} /></DataTableViewport></main>);
    const parent = screen.getByTestId('page-scroll');
    const viewport = screen.getByLabelText('边缘拖拽表格');
    const grip = screen.getByRole('button', { name: '拖动设置最大展示行数' });
    Object.defineProperties(parent, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, get: () => parseFloat(viewport.style.height) + 140 },
    });
    parent.getBoundingClientRect = () => ({ top: 0, bottom: 600 });
    grip.getBoundingClientRect = () => {
      const top = 100 + parseFloat(viewport.style.height) - parent.scrollTop;
      return { top, bottom: top + 32, height: 32 };
    };
    parent.scrollTop = 300;
    fireEvent(grip, new MouseEvent('pointerdown', { button: 0, clientY: 574, bubbles: true }));
    fireEvent(grip, new MouseEvent('pointermove', { clientY: 599, bubbles: true }));
    advance(100);
    expect(parent.scrollTop).toBeGreaterThan(1000);
    expect(Number(viewport.dataset.visibleRows)).toBeGreaterThan(40);
    advance(180);
    expect(viewport).toHaveAttribute('data-visible-rows', '72');
    // Even at the data limit, settle the handle inside the visible window.
    expect(grip.getBoundingClientRect().bottom).toBeLessThanOrEqual(601);
    const bottomScroll = parent.scrollTop;
    fireEvent(grip, new MouseEvent('pointerup', { bubbles: true }));
    advance(10);
    expect(parent.scrollTop).toBe(bottomScroll);
    expect(frames.size).toBe(0);
    expect(viewport.closest('.data-query-table')).not.toHaveClass('is-resizing');

    fireEvent(grip, new MouseEvent('pointerdown', { button: 0, clientY: 584, bubbles: true }));
    fireEvent(grip, new MouseEvent('pointermove', { clientY: 1, bubbles: true }));
    advance(220);
    expect(viewport).toHaveAttribute('data-visible-rows', '20');
    expect(parent.scrollTop).toBeLessThan(bottomScroll);
    fireEvent.blur(window);
    const topScroll = parent.scrollTop;
    advance(10);
    expect(parent.scrollTop).toBe(topScroll);
    expect(frames.size).toBe(0);
  } finally {
    request.mockRestore();
    cancel.mockRestore();
  }
});

test('cancels a pending resize frame on pointer cancellation and unmount', () => {
  const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  try {
    const result = render(<DataTableViewport ariaLabel="取消拖拽表格" resizable><Rows count={72} /></DataTableViewport>);
    const grip = screen.getByRole('button', { name: '拖动设置最大展示行数' });
    fireEvent(grip, new MouseEvent('pointerdown', { button: 0, clientY: 100, bubbles: true }));
    fireEvent(grip, new MouseEvent('pointercancel', { bubbles: true }));
    expect(cancel).toHaveBeenCalledWith(123);
    cancel.mockClear();
    fireEvent(grip, new MouseEvent('pointerdown', { button: 0, clientY: 100, bubbles: true }));
    result.unmount();
    expect(cancel).toHaveBeenCalledWith(123);
  } finally {
    request.mockRestore();
    cancel.mockRestore();
  }
});
