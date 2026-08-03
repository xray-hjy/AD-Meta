import { describe, expect, it } from 'vitest';
import { getChartDefinition } from './chartRegistry';

describe('chart analysis-scope capabilities', () => {
  it('allows descriptive composition and hierarchy charts at every scope', () => {
    for (const key of ['species', 'phylum', 'koContribution', 'sunburst', 'treemap', 'sankey', 'radialtree']) {
      expect(getChartDefinition(key).supportedScopes).toEqual([
        'cohort',
        'group',
        'subset',
        'sample',
      ]);
    }
  });

  it('separates taxonomy composition from KO relative contribution', () => {
    expect(getChartDefinition('phylum').availableFor).toEqual(['taxonomy']);
    expect(getChartDefinition('phylum').projection).toBe('composition');
    expect(getChartDefinition('koContribution').availableFor).toEqual(['ko']);
    expect(getChartDefinition('koContribution').projection).toBe('ko_contribution');
    expect(getChartDefinition('koContribution').analysisPolicy.controls[0].purpose)
      .toBe('display');
  });

  it('keeps distribution and ordination charts at multi-sample scopes', () => {
    for (const key of ['boxplot', 'pca', 'pcoa']) {
      expect(getChartDefinition(key).supportedScopes).toEqual([
        'cohort',
        'group',
        'subset',
      ]);
    }
  });

  it('does not start expensive ordination work from hover intent', () => {
    expect(getChartDefinition('pca').prefetchPolicy).toBe('on_navigation');
    expect(getChartDefinition('pcoa').prefetchPolicy).toBe('on_navigation');
    expect(getChartDefinition('phylum').prefetchPolicy).toBeUndefined();
  });

  it('requires both groups for inferential comparisons', () => {
    for (const key of ['heatmap', 'detection', 'differential_ko']) {
      expect(getChartDefinition(key).supportedScopes).toEqual(['cohort', 'subset']);
    }
  });

  it('uses chart-specific preset controls for scientific analysis parameters', () => {
    const heatmap = getChartDefinition('heatmap').analysisPolicy;
    expect(heatmap.scope.minPerGroup).toBe(3);
    expect(heatmap.controls.find(control => control.key === 'qValueMax').options)
      .toEqual([
        { value: 0.01, label: '0.01' },
        { value: 0.05, label: '0.05' },
        { value: 0.1, label: '0.1' },
      ]);

    const pcaTopN = getChartDefinition('pca').analysisPolicy.controls[0];
    expect(pcaTopN.input).toBe('select');
    expect(pcaTopN.purpose).toBe('feature_selection');
    expect(pcaTopN.options.map(option => option.value)).toEqual([50, 100, 200, 500]);

    const pcoaControls = getChartDefinition('pcoa').analysisPolicy.controls;
    expect(pcoaControls.find(control => control.key === 'topN')).toBeUndefined();
    expect(pcoaControls.find(control => control.key === 'filterPreset')).toMatchObject({
      input: 'select',
      defaultValue: 'standard',
      purpose: 'ordination_filter',
    });
    expect(pcoaControls[0].options.map(option => option.value)).toEqual([
      'unfiltered',
      'inclusive',
      'standard',
      'robust',
    ]);

    const heatmapTopN = heatmap.controls.find(control => control.key === 'topN');
    expect(heatmapTopN.purpose).toBe('display');
  });
});
