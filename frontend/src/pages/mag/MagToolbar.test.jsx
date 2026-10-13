import { selectOption } from '../../test/selectOption';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MagChartExportMenu, MagHeatmapCountControl } from './MagToolbar';

test('exports with the current format and size, and closes without a duplicate export action', () => {
  const exported = vi.fn();
  function ExportHarness() {
    const [format, setFormat] = useState('svg');
    const [size, setSize] = useState('standard');
    return <MagChartExportMenu format={format} size={size} onFormatChange={setFormat} onSizeChange={setSize}
      actions={[{ id: 'export', label: '原始导出', onClick: () => exported({ format, size }) }]} />;
  }
  render(<ExportHarness />);
  expect(screen.queryByLabelText('图像格式')).toBeNull();
  expect(screen.queryByRole('button', { name: '原始导出' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '导出图像' }));
  selectOption(screen.getByLabelText('图像格式'), 'png');
  selectOption(screen.getByLabelText('导出尺寸'), 'large');
  fireEvent.click(screen.getByRole('button', { name: '下载 PNG 图像' }));
  expect(exported).toHaveBeenCalledExactlyOnceWith({ format: 'png', size: 'large' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '导出图像' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '导出图像' }));
  expect(screen.getByLabelText('图像格式')).toHaveTextContent('PNG');
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('heatmap count opens outside clipping containers and keeps panel clicks separate from outside dismissal', () => {
  const changed = vi.fn();
  const submit = vi.fn(event => event.preventDefault());
  render(<form onSubmit={submit} style={{ overflow: 'hidden' }}>
    <MagHeatmapCountControl value={20} sourceCount={872} matchedCount={872} sampleCount={185}
      pendingFilters={false} loading={false} onChange={changed} />
  </form>);
  const trigger = screen.getByRole('button', { name: '显示 MAG 数' });
  fireEvent.click(trigger);
  const panel = screen.getByRole('dialog', { name: '热图 MAG 显示数量' });
  expect(panel.parentElement).toBe(document.body);
  expect(panel.style.position).toBe('fixed');
  fireEvent.pointerDown(screen.getByRole('button', { name: '50', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '50', exact: true }));
  expect(panel).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '确认数量' }));
  expect(changed).toHaveBeenCalledExactlyOnceWith(50);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
});
