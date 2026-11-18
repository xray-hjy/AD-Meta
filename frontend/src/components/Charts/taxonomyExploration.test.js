import { clampLegendPosition, taxonomyIndex, taxonomySemantics, taxonomyTooltip, withoutTaxonomyLabels } from './taxonomyExploration';

test('hiding labels preserves source names, node values and option functions', () => {
  const formatter = () => 'label';
  const source = { series: [{ label: { show: true, formatter }, levels: [{ upperLabel: { show: true } }],
    data: [{ name: 'id', label: 'Firmicutes', value: 185 }], emphasis: { label: { show: true } } }] };
  const hidden = withoutTaxonomyLabels(source).series[0];
  expect(hidden.label).toEqual({ show: false, formatter });
  expect(hidden.data).toEqual(source.series[0].data);
  expect(hidden.levels[0].upperLabel.show).toBe(false);
  expect(hidden.emphasis.label.show).toBe(false);
  expect(source.series[0].label.show).toBe(true);
});

test('equal names in different branches retain distinct ids and complete parent paths', () => {
  const index = taxonomyIndex([{ name: 'A', value: 4, children: [{ name: 'Same', value: 4 }] }, { name: 'B', value: 6, children: [{ name: 'Same', value: 6 }] }]);
  expect(index.entries.filter(node => node.name === 'Same')).toHaveLength(2);
  expect(new Set(index.entries.map(node => node.id)).size).toBe(4);
  expect(index.total).toBe(10);
  expect(index.entries[1].fullPath).toBe('A > Same');
  expect(index.byId.get(index.entries[1].parentId).name).toBe('A');
});

test('185 is a sum of sample fractions, not 185 percent; tooltip provides explicit denominators', () => {
  const semantics = taxonomySemantics({ projection: { sampleCount: 185 }, dataSemantics: { abundanceScale: 'relative_abundance' } }, 185);
  const tooltip = taxonomyTooltip({ name: '<img>', value: 185, data: { value: 185, name: '<img>' } }, semantics);
  expect(tooltip).toContain('累计相对丰度（比例）: 185');
  expect(tooltip).toContain('185 个样本的均值: 100%');
  expect(tooltip).toContain('占完整范围总和: 100%');
  expect(tooltip).toContain('&lt;img&gt;');
  expect(tooltip).not.toContain('<img>');
  expect(tooltip).not.toContain('185%');
});

test('unverified units and tiny values never become false percentages or zeroes', () => {
  const tooltip = taxonomyTooltip({ data: { value: 1e-10 } }, taxonomySemantics(null, 10));
  expect(tooltip).toContain('累计源丰度: 1.0000e-10');
  expect(tooltip).toContain('不能推算样本均值');
});

test('legend bounds cover oversized cards and extreme drags', () => {
  expect(clampLegendPosition({ x: -999, y: 999 }, { width: 1000, height: 600 }, { width: 350, height: 300 })).toEqual({ x: 0, y: 300 });
  expect(clampLegendPosition({ x: 100, y: 100 }, { width: 200, height: 100 }, { width: 350, height: 300 })).toEqual({ x: 0, y: 0 });
});
