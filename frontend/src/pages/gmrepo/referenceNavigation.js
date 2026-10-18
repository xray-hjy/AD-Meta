const SUBJECT_KEYS = ['subjectType', 'subjectId', 'sourceRevision', 'datasetSlug', 'runKey', 'artifactKey', 'sourceScope', 'sourceChart', 'analysisGenus', 'analysisQuery', 'analysisPage'];

export function referenceParams(params, changes = {}) {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value == null || value === '') next.delete(key); else next.set(key, String(value));
  });
  return next;
}

export function referenceHref(params, changes = {}) {
  const next = referenceParams(params, changes);
  return `/reference/gmrepo${next.size ? `?${next}` : ''}`;
}

export function subjectHref(params, { genus, cohort } = {}) {
  const next = new URLSearchParams(params);
  if (genus) {
    SUBJECT_KEYS.forEach(key => next.delete(key));
    next.set('subjectType', 'genus'); next.set('subjectId', genus);
  }
  if (cohort) next.set('analysisCohort', cohort);
  if (!next.get('subjectId') && !next.get('analysisGenus')) return referenceHref(next, { section: 'genera' });
  return `/reference/gmrepo/evidence?${next}`;
}

export function withoutSubject(params) {
  const next = new URLSearchParams(params);
  [...SUBJECT_KEYS, 'analysisCohort', 'evaluationId'].forEach(key => next.delete(key));
  return next;
}
