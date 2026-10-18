import { fetchJson } from './client';

/** @typedef {import('./client').FetchJsonOptions} FetchJsonOptions */
/** @typedef {Record<string, string | number | null | undefined>} ReferenceParams */
/** @param {ReferenceParams} params */
function search(params = {}) {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) result.set(key, String(value));
  });
  return result.toString();
}

/** @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoCatalogResponse']>} */
export function getGmrepoCatalog(options) {
  return fetchJson('/api/references/gmrepo/catalog', options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoOverviewResponse']>} */
export function getGmrepoOverview(params, options) {
  return fetchJson(`/api/references/gmrepo/overview?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoGeneraResponse']>} */
export function getGmrepoGenera(params, options) {
  return fetchJson(`/api/references/gmrepo/genera?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoSamplesResponse']>} */
export function getGmrepoSamples(params, options) {
  return fetchJson(`/api/references/gmrepo/samples?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoAuditResponse']>} */
export function getGmrepoAudit(params, options) {
  return fetchJson(`/api/references/gmrepo/audit?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoDistributionResponse']>} */
export function getGmrepoDistribution(params, options) {
  return fetchJson(`/api/references/gmrepo/distribution?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoStatisticsResponse']>} */
export function getGmrepoStatistics(params, options) {
  return fetchJson(`/api/references/gmrepo/statistics?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoEvidenceResponse']>} */
export function getGmrepoEvidence(params, options) {
  return fetchJson(`/api/references/gmrepo/evidence?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoResourcesResponse']>} */
export function getGmrepoResources(params, options) {
  return fetchJson(`/api/references/gmrepo/resources?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoSubjectResponse']>} */
export function resolveGmrepoSubject(params, options) {
  return fetchJson(`/api/references/gmrepo/resolve-subject?${search(params)}`, options);
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoEvaluationResponse']>} */
export function getGmrepoEvaluation(params, options) {
  return fetchJson(`/api/references/gmrepo/evidence-summary?${search(params)}`, options);
}

/** @param {ReferenceParams} params */
export function gmrepoReportUrl(params) {
  const fixed = { ...params };
  if (fixed.evaluationId) delete fixed.revision;
  return `${import.meta.env.VITE_API_BASE_URL || ''}/api/references/gmrepo/report?${search(fixed)}`;
}

/** @param {string} evaluationId @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['GmrepoEvaluationPackageResponse']>} */
export function getGmrepoEvaluationPackage(evaluationId, options) {
  return fetchJson(`/api/references/gmrepo/evaluation-package?${search({ evaluationId })}`, options);
}

/** @param {string} evaluationId */
export function gmrepoReplayUrl(evaluationId) {
  return `${import.meta.env.VITE_API_BASE_URL || ''}/api/references/gmrepo/recompute-package?${search({ evaluationId })}`;
}

/** @param {ReferenceParams} params @param {FetchJsonOptions} [options] @returns {Promise<any>} */
export function getGmrepoComparisonCatalog(params, options) {
  return fetchJson(`/api/references/gmrepo/comparison-catalog?${search(params)}`, { timeoutMs: 60000, ...options });
}

/** @param {ReferenceParams} params @param {unknown} body @param {FetchJsonOptions} [options] @returns {Promise<any>} */
export function createGmrepoComparison(params, body, options) {
  return fetchJson(`/api/references/gmrepo/candidate-comparison?${search(params)}`, { timeoutMs: 60000, ...options, method: 'POST', body });
}

/** @param {string} evaluationId */
export function gmrepoCandidateReportUrl(evaluationId) {
  return `${import.meta.env.VITE_API_BASE_URL || ''}/api/references/gmrepo/candidate-report?${search({ evaluationId })}`;
}
