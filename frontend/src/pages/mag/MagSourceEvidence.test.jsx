import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { getMagSources } from '../../api/mag';
import MagProcessingFlow from './MagProcessingFlow';

vi.mock('../../api/mag', async original => ({ ...await original(), getMagSources: vi.fn() }));

test('loads sources only on request, filters stage scripts, and preserves download indices and revision', async () => {
  getMagSources.mockResolvedValue({ modules: {
    quality: { files: [{ file: 'raw/quality.tsv', sha256: 'quality-hash', bytes: 25 }] },
    lineage: { files: [{ file: 'raw/drep.csv', sha256: 'drep-hash', bytes: 35 }] },
    methodology: { report: { scripts: { quality: { file: 'scripts/checkm2.sh' }, dereplication: { file: 'scripts/drep.sh' } } },
      files: [{ file: 'scripts/unrelated.sh', sha256: 'other', bytes: 10 }, { file: 'scripts/checkm2.sh', sha256: 'script-hash', bytes: 20 }, { file: 'scripts/drep.sh', sha256: 'script-2', bytes: 30 }] },
    bgc: { files: [{ file: 'raw/region.gbk', sha256: 'bgc', bytes: 40 }] },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MagProcessingFlow provenance={{ version: 'cohort', magCount: 1, sampleCount: 2, groupCounts: { AD: 1, NC: 1 }, dataFingerprint: 'release-a' }} capabilities={{ quality: true }} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /质量评估与筛选/ }));
  expect(getMagSources).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /来源文件与脚本/ }));
  fireEvent.click(await screen.findByRole('button', { name: /方法脚本 · 2 个文件/ }));
  const link = screen.getByText('scripts/checkm2.sh').closest('li');
  expect(within(link).getByRole('link', { name: /下载原文件/ })).toHaveAttribute('href', '/api/mag/sources/methodology/1?revision=release-a');
  expect(screen.queryByText('scripts/unrelated.sh')).toBeNull();
  expect(screen.queryByText('raw/region.gbk')).toBeNull();
  expect(getMagSources).toHaveBeenCalledWith('release-a', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  fireEvent.click(within(screen.getByRole('group', { name: 'MAG 完整上下游流程' })).getByRole('button', { name: /dRep 去冗余/ }));
  fireEvent.click(screen.getByRole('button', { name: /来源文件与脚本/ }));
  await waitFor(() => expect(getMagSources).toHaveBeenCalledTimes(1));
  client.clear();
});
