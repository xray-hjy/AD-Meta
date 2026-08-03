import { describe, expect, it } from 'vitest';
import {
  normalizeAnalysisParameters,
  scopeForMode,
  validateAnalysisScope,
} from './analysisPolicy';

const samples = [
  { sampleCode: 'A1', phenotype: 'AD' },
  { sampleCode: 'A2', phenotype: 'AD' },
  { sampleCode: 'A3', phenotype: 'AD' },
  { sampleCode: 'N1', phenotype: 'NC' },
  { sampleCode: 'N2', phenotype: 'NC' },
  { sampleCode: 'N3', phenotype: 'NC' },
];

const comparisonPolicy = {
  scope: {
    allowed: ['cohort', 'subset'],
    minSamples: 6,
    minPerGroup: 3,
    requiredGroups: ['AD', 'NC'],
  },
};

describe('analysis policy validation', () => {
  it('accepts a balanced cohort comparison', () => {
    const result = validateAnalysisScope(comparisonPolicy, scopeForMode('cohort'), samples);
    expect(result.valid).toBe(true);
    expect(result.groupCounts).toEqual({ AD: 3, NC: 3 });
  });

  it('rejects a custom comparison when either group is undersized', () => {
    const scope = scopeForMode('subset', ['A1', 'A2', 'A3', 'N1', 'N2']);
    const result = validateAnalysisScope(comparisonPolicy, scope, samples);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('3 个 AD 与 3 个 NC');
    expect(result.groupCounts).toEqual({ AD: 3, NC: 2 });
  });

  it('keeps exploratory single-group ordination valid when sample count is sufficient', () => {
    const policy = {
      scope: { allowed: ['cohort', 'group', 'subset'], minSamples: 3 },
    };
    const result = validateAnalysisScope(policy, scopeForMode('AD'), samples);
    expect(result.valid).toBe(true);
    expect(result.sampleCount).toBe(3);
  });

  it('normalizes only controls owned by the active chart policy', () => {
    const policy = {
      controls: [
        {
          key: 'topN',
          input: 'select',
          defaultValue: 50,
          options: [{ value: 20 }, { value: 50 }, { value: 100 }],
        },
        {
          key: 'qValueMax',
          input: 'select',
          defaultValue: 0.05,
          options: [{ value: 0.01 }, { value: 0.05 }, { value: 0.1 }],
        },
      ],
    };

    expect(normalizeAnalysisParameters(policy, 37, {
      qValueMax: 0.07,
      unrelatedParameter: 99,
    })).toEqual({
      topN: 50,
      parameters: { qValueMax: 0.05 },
    });
  });

  it('retains valid chart-specific preset values', () => {
    const policy = {
      controls: [{
        key: 'topN',
        input: 'select',
        defaultValue: 500,
        options: [{ value: 50 }, { value: 100 }, { value: 500 }],
      }],
    };

    expect(normalizeAnalysisParameters(policy, 100, {})).toEqual({
      topN: 100,
      parameters: {},
    });
  });
});
