import { selectOption } from '../../test/selectOption';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import ChartFrameActionGroup from './ChartFrameActionGroup';

test('the shared export panel submits size/resolution, retains defaults and restores focus', () => {
  localStorage.clear();
  const exportImage = vi.fn();
  render(<ChartFrameActionGroup actions={[{ id: 'export', label: '导出图像', supportsCustomSize: true,
    suggestedSize: { width: 1500, height: 1000 }, onClick: exportImage }]} />);
  const button = screen.getByRole('button', { name: '导出图像', exact: true });
  fireEvent.click(button);
  const panel = within(screen.getByRole('dialog', { name: '图像导出设置' }));
  expect(panel.getByLabelText('分辨率')).toBeDisabled();
  fireEvent.click(panel.getByRole('button', { name: 'PNG 位图 · 演示分享' }));
  selectOption(panel.getByLabelText('导出尺寸'), 'custom');
  fireEvent.change(panel.getByLabelText('宽度（px）'), { target: { value: '800' } });
  fireEvent.change(panel.getByLabelText('高度（px）'), { target: { value: '500' } });
  selectOption(panel.getByLabelText('分辨率'), '2');
  expect(panel.getByText('1600 × 1000 px · PNG')).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: '设为默认' }));
  fireEvent.click(panel.getByRole('button', { name: '下载 PNG 图像' }));
  expect(exportImage).toHaveBeenCalledExactlyOnceWith({ format: 'png', width: 800, height: 500, pixelRatio: 2 });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(screen.getByLabelText('宽度（px）')).toHaveValue(800);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(button).toHaveFocus();
});
