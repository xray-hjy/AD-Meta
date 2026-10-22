import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import MagProcessingFlow from './MagProcessingFlow';

const provenance = {
  version: 'test-cohort', magCount: 872, sampleCount: 185, excludedSampleCount: 0,
  dataFingerprint: 'revision-a', cohort: { projectAccession: 'PROJECT', studyAccession: 'STUDY' },
  processing: { assessedBins: 9133, qualifiedBins: 8548, representativeMags: 872, sampleCount: 185 },
  modules: { samples: { groupCounts: { AD: 122, NC: 63 } }, quality: { tool: { version: '1.1.0' } },
    lineage: { parameters: { completeness: 50, contamination: 10, P_ani: .9, S_ani: .95, S_algorithm: 'fastANI', clusterAlg: 'average' } } },
  communityResults: { species: { datasetSlug: 'species', revision: 'species-revision' } },
};
const capabilities = { quality: true, lineage: true, taxonomy: true, phylogeny: true, arg: true, bgc: true };
const node = name => within(screen.getByRole('group', { name: 'MAG 完整上下游流程' })).getByRole('button', { name });

test('shows upstream, downstream and community branches while source counts remain independent of filters', () => {
  const { rerender } = render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} />);
  for (const name of [/质控与去宿主/, /组装与回贴/, /分箱与整合/, /质量评估与筛选/, /dRep 去冗余/, /样本丰度/, /分类注释/, /系统发育/, /ARG 解析/, /基因簇解析/, /代谢功能/, /群落物种/, /群落功能/]) expect(node(name)).toBeVisible();
  expect(node(/分箱与整合/)).toHaveTextContent('9,133');
  expect(node(/质量评估与筛选/)).toHaveTextContent('8,548');
  expect(node(/dRep 去冗余/)).toHaveTextContent('872');
  rerender(<MagProcessingFlow provenance={{ ...provenance, sampleCount: 12, excludedSampleCount: 173 }} capabilities={capabilities} />);
  expect(screen.getByText('PROJECT · 185 个样本')).toBeVisible();
  fireEvent.click(node(/样本丰度/));
  const detail = screen.getByRole('region', { name: '流程步骤详情' });
  expect(within(detail).getByText('丰度矩阵 185 × 872')).toBeVisible();
  expect(within(detail).getByText('Clean Reads ＋ 代表 MAG FASTA。')).toBeVisible();
  expect(within(detail).getByText(/使用 strobealign/)).toBeVisible();
});

test.each([{ ...provenance, processing: null }, { ...provenance, modules: null }, { ...provenance, magCount: 50 }])('does not invent upstream counts for missing or inconsistent metadata', audit => {
  render(<MagProcessingFlow provenance={audit} capabilities={capabilities} />);
  expect(node(/分箱与整合/)).not.toHaveTextContent('9,133');
  expect(node(/质量评估与筛选/)).not.toHaveTextContent('8,548');
  expect(screen.queryByText(/待记录|待补充|未完成/)).toBeNull();
});

test('pins click selection, switches the shared detail and restores focus when closing', () => {
  render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} />);
  const quality = node(/质量评估与筛选/), drep = node(/dRep 去冗余/);
  fireEvent.click(quality);
  fireEvent.mouseEnter(drep);
  expect(quality).toHaveAttribute('aria-expanded', 'true');
  expect(drep).toHaveAttribute('aria-expanded', 'false');
  let detail = screen.getByRole('region', { name: '流程步骤详情' });
  expect(within(detail).getByText('完整度 ≥50%')).toBeVisible();
  expect(within(detail).getByText('污染度 ≤10%')).toBeVisible();
  fireEvent.click(drep);
  expect(quality).toHaveAttribute('aria-expanded', 'false');
  detail = screen.getByRole('region', { name: '流程步骤详情' });
  expect(within(detail).getByText(/实际 ANI 下限/)).toBeVisible();
  fireEvent.click(within(detail).getByRole('button', { name: '收起流程步骤详情' }));
  expect(screen.queryByRole('region', { name: '流程步骤详情' })).toBeNull();
  expect(drep).toHaveFocus();
});

test('navigates only available results and leaves metabolism as a neutral method slot', () => {
  const onNavigate = vi.fn(), onCommunityNavigate = vi.fn();
  render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} onNavigate={onNavigate} onCommunityNavigate={onCommunityNavigate} />);
  fireEvent.click(node(/dRep 去冗余/));
  fireEvent.click(screen.getByRole('button', { name: /查看来源与去冗余/ }));
  expect(onNavigate).toHaveBeenCalledWith('lineage');
  fireEvent.click(node(/群落物种/));
  fireEvent.click(screen.getByRole('button', { name: /查看群落物种结果/ }));
  expect(onCommunityNavigate).toHaveBeenCalledWith(provenance.communityResults.species);
  fireEvent.click(node(/代谢功能/));
  const detail = screen.getByRole('region', { name: '流程步骤详情' });
  expect(within(detail).getByText('以 MAG 为单位关联基因与代谢功能信息。')).toBeVisible();
  expect(within(detail).queryByRole('button', { name: /查看对应结果|来源文件与脚本/ })).toBeNull();
  expect(within(detail).queryByLabelText('关键参数与统计')).toBeNull();
});

test('supports keyboard navigation across flow nodes', () => {
  render(<MagProcessingFlow provenance={provenance} capabilities={capabilities} />);
  const source = node(/测序数据/);
  act(() => source.focus());
  fireEvent.keyDown(source, { key: 'ArrowRight' });
  expect(node(/质控与去宿主/)).toHaveFocus();
});
