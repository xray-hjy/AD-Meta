// @vitest-environment node
import { buildReviewFiles, csvBytes, groupSummaryRows } from './boxplotResearch';

const transforms = [{ key: 'raw', label: '相对丰度（%）', formula: '100 × x' },
  { key: 'sqrt', label: 'sqrt(丰度 %)', formula: 'sqrt(100 × x)' }, { key: 'log', label: 'log10(丰度 % + 1)', formula: 'log10(100 × x + 1)' }];
const sample = { featureId: 'A', fullName: 'k__Bacteria|s__Species_A', shortName: 'Species_A', groupStats: {
  AD: { sampleCount: 2, validCount: 2, missingCount: 0, detectedCount: 1, zeroCount: 1, detectionRate: 0.5 },
  NC: { sampleCount: 1, validCount: 0, missingCount: 1, detectedCount: 0, zeroCount: 0, detectionRate: null },
}, values: { AD: Object.fromEntries(transforms.map(transform => {
  const upper = transform.key === 'raw' ? 10 : transform.key === 'sqrt' ? Math.sqrt(10) : Math.log10(11);
  return [transform.key, { box: [0, upper / 4, upper / 2, upper * 3 / 4, upper], outlierPoints: [] }];
})), NC: Object.fromEntries(transforms.map(transform => [transform.key, { box: null, outlierPoints: [] }])) } };
const model = { available: [sample], series: [{ key: 'AD', label: 'AD' }, { key: 'NC', label: 'NC' }], activeTransform: transforms[1],
  groupCounts: { AD: 2, NC: 1 }, view: 'facets', axisMode: 'independent', focus: true, page: 1, pageSize: 2 };
const projection = { projectionKey: 'key-for-the-displayed-projection', runKey: 'run', artifactKey: 'species', datasetRevision: 'v1',
  scope: { mode: 'subset', sampleCodes: ['AD1', 'AD2', 'NC1'] }, projectionRequest: { scope: { mode: 'subset', sampleCodes: ['AD1', 'AD2', 'NC1'] } },
  dataSemantics: { abundanceScale: 'relative_abundance', normalization: 'input fraction' },
  payload: { valueTransforms: transforms, statisticalMethods: { zeros: 'included' } } };
const review = { projectionKey: projection.projectionKey, samples: [{ sampleCode: 'AD1', group: 'AD' }, { sampleCode: 'AD2', group: 'AD' }, { sampleCode: 'NC1', group: 'NC' }],
  items: [{ featureId: 'A', storedValues: [0, 0.1, null], displayValues: { raw: [0, 10, null], sqrt: [0, Math.sqrt(10), null], log: [0, 1.0413926851582251, null] } }], displayMultiplier: 100 };
const decode = bytes => new TextDecoder().decode(bytes);

test('summaries preserve backend transformed quartiles and distinguish missing, zero and unknown denominators', () => {
  const [ad, nc] = groupSummaryRows([sample], model.series, transforms[1]);
  expect(ad).toMatchObject({ detectionRate: 0.5, detectedCount: 1, validCount: 2, median: Math.sqrt(10) / 2 });
  expect(ad.iqr).toBeCloseTo(Math.sqrt(10) / 2, 14);
  expect(nc).toMatchObject({ detectionRate: null, validCount: 0, missingCount: 1, median: null, iqr: null });
  const unknown = groupSummaryRows([{ ...sample, groupStats: undefined }], model.series, transforms[0], { AD: 2 })[0];
  expect(unknown).toMatchObject({ sampleCount: 2, validCount: null, detectionRate: null });
});

test('review package keeps stored and displayed units separate, preserves zeros and missing values, and covers all scales', () => {
  const files = buildReviewFiles(projection, model, review, { aria: { decal: { show: true } }, series: [{ id: 'box-median-labels-0', type: 'custom' }] },
    { format: 'png', exportedPages: [{ width: 1100, height: 456, pixelRatio: 2 }] });
  expect(files.map(file => file.name)).toEqual(['group-statistics.csv', 'sample-abundance.csv', 'metadata.json', 'README.txt']);
  const summary = decode(files[0].bytes);
  expect(summary.split('\r\n')).toHaveLength(7); // 2 groups x 3 scales, plus header
  const samples = decode(files[1].bytes).split('\r\n');
  expect(samples).toHaveLength(4);
  expect(samples[1]).toContain('"0","0","0","0","false","zero"');
  expect(samples[2]).toContain('"0.1","10"');
  expect(samples[2]).toContain('"1.0413926851582251"'); // retain the supplied backend float; do not recompute in the browser
  expect(samples[3]).toContain('"","","","","","missing"');
  const metadata = JSON.parse(decode(files[2].bytes));
  expect(metadata).toMatchObject({ projectionKey: projection.projectionKey, displayMultiplier: 100,
    currentFigure: { transform: transforms[1], focus: true, format: 'png', styles: { medianLabels: true, colorBlindFriendly: true } } });
  expect(metadata.samples).toEqual(review.samples);
  expect(metadata.selectedFeatures[0].fullName).toBe(sample.fullName);
});

test('mismatched projection IDs and truncated sample matrices reject the whole download', () => {
  expect(() => buildReviewFiles(projection, model, { ...review, projectionKey: 'other' })).toThrow('不一致');
  expect(() => buildReviewFiles(projection, model, { ...review, items: [{ featureId: 'A', storedValues: [0] }] })).toThrow('不完整');
});

test('CSV escapes spreadsheet formulas only in text and preserves numeric precision', () => {
  const text = decode(csvBytes(['sample', 'value', 'note'], [{ sample: '=SUM(1,2)', value: -0.000000123456789, note: 'line\n"quoted"' }]));
  expect(text).toContain('"\'=SUM(1,2)"');
  expect(text).toContain('"-1.23456789e-7"');
  expect(text).toContain('"line\n""quoted"""');
});
