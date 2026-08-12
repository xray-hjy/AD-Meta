import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import BoxplotFeatureSelector from './BoxplotFeatureSelector';

const { scopedFeatures } = vi.hoisted(() => ({
  scopedFeatures: vi.fn(),
}));

vi.mock('../../hooks/useScopedFeatures', () => ({
  default: (...args) => scopedFeatures(...args),
}));

const candidates = [
  {
    featureId: 'feature-a',
    fullName: 'k__Bacteria|s__Alpha_species',
    shortName: 'Alpha_species',
    rank: 1,
    meanAbundance: 10,
    detectedSampleCount: 8,
    prevalence: 0.8,
  },
  {
    featureId: 'feature-b',
    fullName: 'k__Bacteria|s__Beta_species',
    shortName: 'Beta_species',
    rank: 2,
    meanAbundance: 9,
    detectedSampleCount: 7,
    prevalence: 0.7,
  },
];

beforeEach(() => {
  scopedFeatures.mockReturnValue({
    data: { items: candidates, total: 2, sourceFeatureCount: 9460 },
    loading: false,
    fetching: false,
    error: null,
  });
});

test('uses ranked Top 30 by default and exposes scientific presets', () => {
  const onChange = vi.fn();
  render(
    <BoxplotFeatureSelector
      runKey="run"
      artifactKey="artifact"
      scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
      value={{ mode: 'ranked', ranking: 'mean_abundance', limit: 30, items: [] }}
      onChange={onChange}
      featureLabel="物种"
      config={{ defaultLimit: 30, rankedLimits: [10, 20, 30, 50, 100] }}
    />
  );

  expect(screen.getByLabelText('参与计算的物种数').value).toBe('30');
  expect(screen.getByText('按当前分析范围内的平均丰度排名；切换范围时重新排名。')).toBeTruthy();
});

test('seeds custom selection with stable feature IDs and supports complete-catalog search', async () => {
  let current = { mode: 'ranked', ranking: 'mean_abundance', limit: 30, items: [] };
  const onChange = vi.fn(updater => {
    current = typeof updater === 'function' ? updater(current) : updater;
  });
  const { rerender } = render(
    <BoxplotFeatureSelector
      runKey="run"
      artifactKey="artifact"
      scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
      value={current}
      onChange={onChange}
      featureLabel="物种"
      config={{ defaultLimit: 30 }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: '自定义物种' }));
  current = { ...current, mode: 'explicit' };
  rerender(
    <BoxplotFeatureSelector
      runKey="run"
      artifactKey="artifact"
      scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
      value={current}
      onChange={onChange}
      featureLabel="物种"
      config={{ defaultLimit: 30 }}
    />
  );

  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(current.items.map(item => item.featureId)).toEqual(['feature-a', 'feature-b']);

  fireEvent.change(screen.getByLabelText('检索全部物种'), { target: { value: 'Alpha' } });
  await waitFor(() => {
    const lastCall = scopedFeatures.mock.calls.at(-1);
    expect(lastCall[2].query).toBe('Alpha');
  });
});

test('separates candidate-pool membership from chart inclusion', () => {
  const value = {
    mode: 'explicit',
    ranking: 'mean_abundance',
    limit: 30,
    items: [{ ...candidates[0], included: true }],
  };
  const onChange = vi.fn();
  render(
    <BoxplotFeatureSelector
      runKey="run"
      artifactKey="artifact"
      scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
      value={value}
      onChange={onChange}
      featureLabel="物种"
    />
  );

  expect(screen.getByText('选择池 1 个物种')).toBeTruthy();
  expect(screen.getByText('图表中 1 个 · 切换 AD/NC 范围时保留此列表')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '添加到选择池 Beta_species' }));
  let updater = onChange.mock.calls.at(-1)[0];
  let nextValue = updater(value);
  expect(nextValue.items).toEqual([
    value.items[0],
    expect.objectContaining({ featureId: 'feature-b', included: true }),
  ]);

  fireEvent.click(screen.getByRole('button', { name: '暂不在图表显示 Alpha_species' }));
  updater = onChange.mock.calls.at(-1)[0];
  nextValue = updater(value);
  expect(nextValue.items[0]).toEqual(expect.objectContaining({
    featureId: 'feature-a',
    included: false,
  }));

  fireEvent.click(screen.getByRole('button', { name: '从选择池删除 Alpha_species' }));
  updater = onChange.mock.calls.at(-1)[0];
  nextValue = updater(value);
  expect(nextValue.items).toEqual([]);
});
