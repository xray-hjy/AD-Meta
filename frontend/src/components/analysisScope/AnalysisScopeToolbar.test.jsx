import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalysisScopeToolbar from './AnalysisScopeToolbar';

const samples = [
  { sampleCode: 'A1', phenotype: 'AD' },
  { sampleCode: 'A2', phenotype: 'AD' },
  { sampleCode: 'A3', phenotype: 'AD' },
  { sampleCode: 'N1', phenotype: 'NC' },
  { sampleCode: 'N2', phenotype: 'NC' },
  { sampleCode: 'N3', phenotype: 'NC' },
];

const heatmapPolicy = {
  scope: {
    allowed: ['cohort', 'subset'],
    minSamples: 6,
    minPerGroup: 3,
    requiredGroups: ['AD', 'NC'],
    requirement: '至少 3 个 AD 与 3 个 NC 样本',
  },
  controls: [
    {
      key: 'topN',
      label: '差异特征上限',
      input: 'select',
      defaultValue: 50,
      options: [20, 50, 100].map(value => ({ value, label: String(value) })),
    },
    {
      key: 'qValueMax',
      label: 'FDR q 值上限',
      input: 'select',
      defaultValue: 0.05,
      options: [0.01, 0.05, 0.1].map(value => ({ value, label: String(value) })),
    },
  ],
};

describe('AnalysisScopeToolbar', () => {
  it('renders discrete scientific presets instead of arbitrary numeric inputs', () => {
    render(
      <AnalysisScopeToolbar
        scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
        topN={50}
        parameters={{ qValueMax: 0.05 }}
        samples={samples}
        samplesLoading={false}
        featureLabel="物种"
        analysisPolicy={heatmapPolicy}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('差异特征上限').tagName).toBe('SELECT');
    expect(screen.getByText('FDR q 值上限').closest('label')?.querySelector('select')).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('blocks an undersized custom comparison and shows group counts', () => {
    const onChange = vi.fn();
    render(
      <AnalysisScopeToolbar
        scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
        topN={50}
        parameters={{ qValueMax: 0.05 }}
        samples={samples}
        samplesLoading={false}
        featureLabel="物种"
        analysisPolicy={heatmapPolicy}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '自定义子集' }));
    ['A1', 'A2', 'A3', 'N1', 'N2'].forEach(code => {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(code) }));
    });

    expect(screen.getByText(/AD 3.*NC 2/)).toBeTruthy();
    expect(screen.getByText(/至少需要 3 个 AD 与 3 个 NC/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '应用范围' })).toBeDisabled();
  });

  it('preserves string-valued scientific presets when applying a selection', () => {
    const onChange = vi.fn();
    render(
      <AnalysisScopeToolbar
        scope={{ mode: 'cohort', groups: [], sampleCodes: [] }}
        topN={20}
        parameters={{ filterPreset: 'standard' }}
        samples={samples}
        samplesLoading={false}
        featureLabel="物种"
        analysisPolicy={{
          scope: { allowed: ['cohort'], minSamples: 3 },
          controls: [{
            key: 'filterPreset',
            label: '物种过滤策略',
            input: 'select',
            defaultValue: 'standard',
            options: [
              { value: 'standard', label: '标准' },
              { value: 'robust', label: '稳健' },
            ],
          }],
        }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('物种过滤策略'), {
      target: { value: 'robust' },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      { mode: 'cohort', groups: [], sampleCodes: [] },
      20,
      { filterPreset: 'robust' }
    );
  });
});
