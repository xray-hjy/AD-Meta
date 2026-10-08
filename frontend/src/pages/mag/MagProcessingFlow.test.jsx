import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import MagProcessingFlow from './MagProcessingFlow';

const provenance = {
  version: 'mag_v3', magCount: 872, sampleCount: 185, excludedSampleCount: 0,
  dataFingerprint: 'revision-a',
  manifest: { file: 'development_input/mag_v3/provenance/mag_v3_manifest.json',
    sha256: 'aa55cf86a44642b8602aafeb33e6c06c4c85fd1d7678a3b8dd3891728bc6c5f6' },
};
const capabilities = { quality: true, lineage: true };

test('binds upstream counts to the verified package and keeps them independent of sample filters', () => {
  const { rerender } = render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} />);
  expect(screen.getByRole('button', { name: /整合后的 bins/ })).toHaveTextContent('9,133');
  expect(screen.getByRole('button', { name: /通过质量筛选/ })).toHaveTextContent('8,548');
  expect(screen.getByRole('button', { name: /代表 MAG/ })).toHaveTextContent('872');
  rerender(<MagProcessingFlow provenance={{ ...provenance, sampleCount: 12, excludedSampleCount: 173 }} capabilities={capabilities} />);
  expect(screen.getByText('mag_v3 · 185 个样本')).toBeVisible();
  expect(screen.getByRole('button', { name: /通过质量筛选/ })).toHaveTextContent('8,548');
  fireEvent.click(screen.getByRole('button', { name: /代表 MAG/ }));
  expect(screen.getByText('丰度矩阵 185 × 872')).toBeVisible();
});

test.each([
  { ...provenance, manifest: { ...provenance.manifest, sha256: 'another-package' } },
  { ...provenance, version: 'mag_v2' },
  { ...provenance, magCount: 50 },
])('does not assign historical upstream counts to a different package', audit => {
  render(<MagProcessingFlow provenance={audit} capabilities={capabilities} />);
  expect(screen.getByRole('button', { name: /整合后的 bins/ })).toHaveTextContent('待记录');
  expect(screen.getByRole('button', { name: /通过质量筛选/ })).toHaveTextContent('待记录');
  expect(screen.queryByText('9,133')).toBeNull();
  expect(screen.queryByText('8,548')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /整合后的 bins/ }));
  expect(screen.getByText(/不能从代表 MAG 数量反推/)).toBeVisible();
});

test('keeps click selection when hovering another step and allows only one open detail', () => {
  render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} />);
  const selected = screen.getByRole('button', { name: /通过质量筛选/ });
  const other = screen.getByRole('button', { name: /dRep 去冗余/ });
  fireEvent.click(selected);
  expect(selected).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerEnter(other);
  expect(selected).toHaveAttribute('aria-expanded', 'true');
  expect(other).toHaveAttribute('aria-expanded', 'false');
  const detail = screen.getByRole('region', { name: '流程步骤详情' });
  expect(within(detail).getByText('完整度 ≥50%')).toBeVisible();
  expect(within(detail).getByText('污染度 ≤10%')).toBeVisible();
  fireEvent.click(other);
  expect(selected).toHaveAttribute('aria-expanded', 'false');
  expect(other).toHaveAttribute('aria-expanded', 'true');
  expect(within(detail).getByText(/实际 ANI 下限/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '收起流程步骤详情' }));
  expect(detail).not.toBeVisible();
  expect(other).toHaveAttribute('aria-expanded', 'false');
});

test('provides existing view navigation and keeps research and source information in the footer', () => {
  const onNavigate = vi.fn();
  render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} onNavigate={onNavigate} />);
  expect(screen.queryByRole('button', { name: '查看来源' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /CheckM2 评估/ }));
  fireEvent.click(screen.getByRole('button', { name: /查看 MAG 质量/ }));
  expect(onNavigate).toHaveBeenCalledWith('quality');
  fireEvent.click(screen.getByRole('button', { name: /dRep 去冗余/ }));
  fireEvent.click(screen.getByRole('button', { name: /查看来源与去冗余/ }));
  expect(onNavigate).toHaveBeenCalledWith('lineage');
  const methods = screen.getByText('方法与来源').closest('details');
  fireEvent.click(screen.getByText('方法与来源'));
  expect(methods).toHaveAttribute('open');
  expect(within(methods).getByText(/组间检验未做协变量校正/)).toBeVisible();
  expect(within(methods).getByRole('link', { name: '下载数据版本溯源 JSON' })).toHaveAttribute('href', '/api/mag/downloads/provenance?revision=revision-a');
});
