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
