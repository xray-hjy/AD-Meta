import { describe, expect, test } from 'vitest';
import {
  defaultProjectionState,
  loadProjectionState,
  projectionSearchUpdates,
  readProjectionState,
  saveProjectionState,
} from './analysisScope';

describe('analysis scope URL contract', () => {
  test('uses the documented Top N default when the URL omits it', () => {
    expect(readProjectionState(new URLSearchParams())).toEqual({
      scope: { mode: 'cohort', groups: [], sampleCodes: [] },
      topN: 20,
      parameters: {},
    });
  });

  test('round-trips a single-sample scope and Top N', () => {
    const updates = projectionSearchUpdates(
      { mode: 'sample', groups: [], sampleCodes: ['S-01'] },
      42
    );
    const params = new URLSearchParams();
    Object.entries(updates).forEach(([key, value]) => {
      if (value != null) params.set(key, value);
    });

    expect(readProjectionState(params)).toEqual({
      scope: { mode: 'sample', groups: [], sampleCodes: ['S-01'] },
      topN: 42,
      parameters: {},
    });
  });

  test('falls back to the complete cohort for incomplete subset URLs', () => {
    const params = new URLSearchParams('scope=subset&samples=S-01&topN=999');
    expect(readProjectionState(params)).toEqual({
      scope: { mode: 'cohort', groups: [], sampleCodes: [] },
      topN: 500,
      parameters: {},
    });
  });

  test('round-trips reproducible scientific filter parameters', () => {
    const updates = projectionSearchUpdates(
      { mode: 'cohort', groups: [], sampleCodes: [] },
      50,
      { qValueMax: 0.01, log2FcMinAbs: 1.5, prevalenceMin: 0.2 }
    );
    const params = new URLSearchParams();
    Object.entries(updates).forEach(([key, value]) => {
      if (value != null) params.set(key, value);
    });

    expect(readProjectionState(params).parameters).toEqual({
      qValueMax: 0.01,
      log2FcMinAbs: 1.5,
      prevalenceMin: 0.2,
    });
  });

  test('round-trips a typed PCoA filtering preset', () => {
    const policy = {
      controls: [{
        key: 'filterPreset',
        input: 'select',
        defaultValue: 'standard',
        options: [
          { value: 'unfiltered', label: '不过滤' },
          { value: 'standard', label: '标准' },
          { value: 'robust', label: '稳健' },
        ],
      }],
    };
    const updates = projectionSearchUpdates(
      { mode: 'cohort', groups: [], sampleCodes: [] },
      20,
      { filterPreset: 'robust' }
    );
    const params = new URLSearchParams();
    Object.entries(updates).forEach(([key, value]) => {
      if (value != null) params.set(key, value);
    });

    expect(params.get('pcoaFilter')).toBe('robust');
    expect(readProjectionState(params, policy).parameters).toEqual({ filterPreset: 'robust' });
    expect(readProjectionState(new URLSearchParams('pcoaFilter=unknown'), policy).parameters)
      .toEqual({ filterPreset: 'standard' });
  });

  test('derives the initial view from the active chart policy', () => {
    const policy = {
      controls: [
        { key: 'topN', defaultValue: 50 },
        { key: 'qValueMax', defaultValue: 0.05 },
        { key: 'log2FcMinAbs', defaultValue: 1 },
      ],
    };

    expect(defaultProjectionState(policy)).toEqual({
      scope: { mode: 'cohort', groups: [], sampleCodes: [] },
      topN: 50,
      parameters: { qValueMax: 0.05, log2FcMinAbs: 1 },
    });
    expect(readProjectionState(new URLSearchParams(), policy)).toEqual(
      defaultProjectionState(policy)
    );
  });

  test('stores view state independently for every chart', () => {
    const storage = window.sessionStorage;
    storage.clear();
    const abundance = {
      scope: { mode: 'group', groups: ['AD'], sampleCodes: [] },
      topN: 20,
      parameters: {},
    };
    const pcoa = {
      scope: { mode: 'cohort', groups: [], sampleCodes: [] },
      topN: 500,
      parameters: {},
    };

    saveProjectionState(storage, 'run-1', 'species', 'species', abundance);
    saveProjectionState(storage, 'run-1', 'species', 'pcoa', pcoa);

    expect(loadProjectionState(storage, 'run-1', 'species', 'species')).toEqual(abundance);
    expect(loadProjectionState(storage, 'run-1', 'species', 'pcoa')).toEqual(pcoa);
  });
});
