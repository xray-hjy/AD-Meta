import { fetchJson } from './client';

/** @typedef {import('./client').FetchJsonOptions} FetchJsonOptions */
/** @typedef {import('./generated').components['schemas']['AnalysisRunResponse']} AnalysisRun */
/** @typedef {import('./generated').components['schemas']['AnalysisSamplePageResponse']} AnalysisSamplePage */
/** @typedef {import('./generated').components['schemas']['AnalysisFeaturePageResponse']} AnalysisFeaturePage */
/** @typedef {import('./generated').components['schemas']['ScopedSampleRequest']} ScopedSampleRequest */
/** @typedef {import('./generated').components['schemas']['ScopedFeatureRequest']} ScopedFeatureRequest */
/** @typedef {import('./generated').components['schemas']['AbundanceProjectionRequest']} AbundanceProjectionRequest */
/** @typedef {import('./generated').components['schemas']['AbundanceProjectionResponse']} AbundanceProjectionResponse */
/** @typedef {import('./generated').components['schemas']['ChartProjectionRequest']} ChartProjectionRequest */
/** @typedef {import('./generated').components['schemas']['ChartProjectionResponse']} ChartProjectionResponse */
/** @typedef {import('./generated').components['schemas']['ProjectionAuditRequest']} ProjectionAuditRequest */
/** @typedef {import('./generated').components['schemas']['ProjectionAuditResponse']} ProjectionAuditResponse */
/** @typedef {import('./generated').components['schemas']['ProjectionAuditMetadataResponse']} ProjectionAuditMetadataResponse */
/** @typedef {import('./generated').components['schemas']['ProjectionAuditOptionsResponse']} ProjectionAuditOptionsResponse */
/** @typedef {import('./generated').components['schemas']['ProjectionAuditRowsResponse']} ProjectionAuditRowsResponse */
/** @typedef {FetchJsonOptions & {artifactKey?: string, phenotype?: string, query?: string, limit?: number, offset?: number}} SampleListOptions */
/** @typedef {FetchJsonOptions & {query?: string, limit?: number, offset?: number}} AuditOptionListOptions */

/** @param {FetchJsonOptions} [options] @returns {Promise<AnalysisRun[]>} */
export function listAnalysisRuns(options) {
  return fetchJson('/api/analysis-runs', options);
}

/**
 * @param {string} runKey
 * @param {SampleListOptions} [options]
 * @returns {Promise<AnalysisSamplePage>}
 */
export function listAnalysisSamples(runKey, {
  artifactKey,
  phenotype,
  query,
  limit = 500,
  offset = 0,
  signal,
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (artifactKey) params.set('artifactKey', artifactKey);
  if (phenotype) params.set('phenotype', phenotype);
  if (query) params.set('query', query);
  return fetchJson(`/api/analysis-runs/${runKey}/samples?${params}`, { signal });
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {ScopedSampleRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<AnalysisSamplePage>}
 */
export function listScopedAnalysisSamples(runKey, artifactKey, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/samples/query`,
    { ...options, method: 'POST', body: request }
  );
}

/**
 * Query the complete feature catalog for one artifact and sample scope.
 * Empty queries return abundance-ranked features; text queries search the
 * complete catalog rather than filtering a browser-side preview.
 *
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {ScopedFeatureRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<AnalysisFeaturePage>}
 */
export function listScopedAnalysisFeatures(runKey, artifactKey, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/features/query`,
    { ...options, method: 'POST', body: request }
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {AbundanceProjectionRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<AbundanceProjectionResponse>}
 */
export function projectAbundance(runKey, artifactKey, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projections/abundance`,
    { ...options, method: 'POST', body: request }
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {string} projectionKind
 * @param {ChartProjectionRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<ChartProjectionResponse>}
 */
export function projectChart(runKey, artifactKey, projectionKind, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projections/${projectionKind}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request }
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {string} projectionKind
 * @param {ProjectionAuditRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<ProjectionAuditResponse>}
 */
export function getProjectionAudit(runKey, artifactKey, projectionKind, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request }
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {string} projectionKind
 * @param {ProjectionAuditRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<ProjectionAuditMetadataResponse>}
 */
export function getProjectionAuditMetadata(
  runKey,
  artifactKey,
  projectionKind,
  request,
  options = {},
) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}/metadata`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request },
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {string} projectionKind
 * @param {string} field
 * @param {ProjectionAuditRequest} request
 * @param {AuditOptionListOptions} [options]
 * @returns {Promise<ProjectionAuditOptionsResponse>}
 */
export function getProjectionAuditOptions(
  runKey,
  artifactKey,
  projectionKind,
  field,
  request,
  { query = '', limit = 500, offset = 0, ...options } = {},
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set('query', query);
  if (offset) params.set('offset', String(offset));
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}/options/${field}?${params}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request },
  );
}

/**
 * @param {string} runKey
 * @param {string} artifactKey
 * @param {string} projectionKind
 * @param {ProjectionAuditRequest} request
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<ProjectionAuditRowsResponse>}
 */
export function getProjectionAuditRows(
  runKey,
  artifactKey,
  projectionKind,
  request,
  options = {},
) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}/rows`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request },
  );
}
