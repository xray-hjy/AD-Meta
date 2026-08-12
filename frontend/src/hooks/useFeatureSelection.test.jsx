import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import useFeatureSelection from './useFeatureSelection';

beforeEach(() => {
  window.sessionStorage.clear();
});

test('keeps edits as a draft until apply and restores the applied selection', async () => {
  const args = {
    runKey: 'run-1',
    artifactKey: 'species-abundance',
    chartKey: 'boxplot',
  };
  const renderSelection = () => renderHook(
    ({ scopeVersion }) => {
      void scopeVersion;
      return useFeatureSelection(args.runKey, args.artifactKey, args.chartKey, true);
    },
    { initialProps: { scopeVersion: 'cohort' } },
  );
  const hook = renderSelection();

  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => {
    hook.result.current.update({
      mode: 'explicit',
      ranking: 'mean_abundance',
      limit: 30,
      items: [{
        featureId: 'species-42',
        fullName: 'k__Bacteria|s__Selected_species',
        shortName: 'Selected_species',
      }],
    });
  });

  expect(hook.result.current.isDirty).toBe(true);
  expect(hook.result.current.request).toEqual({
    mode: 'ranked',
    ranking: 'mean_abundance',
    limit: 30,
    featureIds: [],
  });
  expect(window.sessionStorage.length).toBe(0);

  act(() => hook.result.current.apply());
  hook.rerender({ scopeVersion: 'AD' });
  expect(hook.result.current.request).toEqual({
    mode: 'explicit',
    ranking: 'mean_abundance',
    limit: 1,
    featureIds: ['species-42'],
  });
  expect(hook.result.current.isDirty).toBe(false);

  hook.unmount();
  const restored = renderSelection();
  await waitFor(() => expect(restored.result.current.value.mode).toBe('explicit'));
  expect(restored.result.current.ready).toBe(true);
  expect(restored.result.current.value.items[0].featureId).toBe('species-42');
  expect(restored.result.current.value.items[0].included).toBe(true);
});

test('keeps excluded pool items locally and only submits included features', async () => {
  const hook = renderHook(() => useFeatureSelection('run-2', 'species', 'boxplot', true));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));

  act(() => {
    hook.result.current.update({
      mode: 'explicit',
      ranking: 'mean_abundance',
      limit: 30,
      items: [
        { featureId: 'species-a', shortName: 'Species A', included: true },
        { featureId: 'species-b', shortName: 'Species B', included: false },
      ],
    });
  });
  act(() => hook.result.current.apply());

  expect(hook.result.current.value.items).toHaveLength(2);
  expect(hook.result.current.request).toEqual({
    mode: 'explicit',
    ranking: 'mean_abundance',
    limit: 1,
    featureIds: ['species-a'],
  });
});

test('reset discards an unapplied ranked limit', async () => {
  const hook = renderHook(() => useFeatureSelection('run-1', 'species', 'boxplot', true));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));

  act(() => hook.result.current.update(current => ({ ...current, limit: 100 })));
  expect(hook.result.current.value.limit).toBe(100);
  expect(hook.result.current.request.limit).toBe(30);

  act(() => hook.result.current.reset());
  expect(hook.result.current.value.limit).toBe(30);
  expect(hook.result.current.isDirty).toBe(false);
});
