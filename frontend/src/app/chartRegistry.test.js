import { describe, expect, test } from 'vitest';
import { getAvailableCharts } from './chartRegistry';

describe('artifact-backed chart navigation', () => {
  test('shows only charts whose required artifact actually exists', () => {
    const charts = getAvailableCharts('ko', 'KO', ['species', 'differential_ko']);
    expect(charts.map(chart => chart.key)).toEqual(['species', 'differential_ko']);
  });

  test('maps the one-cycle lda artifact alias to differential_ko', () => {
    const charts = getAvailableCharts('ko', 'KO', ['lda']);
    expect(charts.map(chart => chart.key)).toEqual(['differential_ko']);
  });
});
