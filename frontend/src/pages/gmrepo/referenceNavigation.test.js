import { referenceHref, subjectHref, withoutSubject } from './referenceNavigation';

const original = new URLSearchParams({ subjectType: 'species', subjectId: '1937', sourceRevision: 'fixed-main', revision: 'fixed-ref',
  runKey: 'run', artifactKey: 'matrix', sourceScope: '{"group":"AD"}', returnTo: '/analysis/abundance?chart=boxplot', section: 'directory' });

test('resource navigation preserves the fixed subject and original visualization context', () => {
  const params = new URL(referenceHref(original, { section: 'quality', cohort: 'P1' }), 'http://local').searchParams;
  expect(params.get('subjectId')).toBe('1937');
  expect(params.get('sourceRevision')).toBe('fixed-main');
  expect(params.get('runKey')).toBe('run');
  expect(params.get('sourceScope')).toBe('{"group":"AD"}');
  expect(new URL(subjectHref(params, { cohort: 'P2' }), 'http://local').searchParams.get('analysisCohort')).toBe('P2');
  expect(original.get('cohort')).toBeNull();
});

test('explicitly choosing a reference genus clears incompatible main-feature claims but keeps the reference and return destination', () => {
  const params = new URL(subjectHref(original, { genus: 'NCBI:816', cohort: 'P1' }), 'http://local').searchParams;
  expect(params.get('subjectType')).toBe('genus'); expect(params.get('subjectId')).toBe('NCBI:816');
  expect(params.has('sourceRevision')).toBe(false); expect(params.has('runKey')).toBe(false);
  expect(params.get('revision')).toBe('fixed-ref'); expect(params.get('analysisCohort')).toBe('P1');
  expect(params.get('returnTo')).toBe('/analysis/abundance?chart=boxplot');
  expect(withoutSubject(original).get('subjectId')).toBeNull();
});

test('navigation without a subject opens a useful genus directory, not the empty evaluation page', () => {
  expect(subjectHref(new URLSearchParams('revision=fixed-ref'))).toBe('/reference/gmrepo?revision=fixed-ref&section=genera');
});
