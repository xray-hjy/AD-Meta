import { fetchJson } from './client';

/** @typedef {import('./client').FetchJsonOptions} FetchJsonOptions */
/** @typedef {Record<string, string | number | null | undefined>} MagParams */

/** @param {MagParams} params */
export function magParams(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) search.set(key, String(value));
  });
  return search.toString();
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagOverviewResponse']>} */
export function getMagOverview(params, options) {
  return fetchJson(`/api/mag/overview?${magParams(params)}`, options);
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagFeaturePageResponse']>} */
export function getMagFeatures(params, options) {
  return fetchJson(`/api/mag/features?${magParams(params)}`, options);
}

/** @param {string} magId @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagDistributionResponse']>} */
export function getMagDistribution(magId, params, options) {
  return fetchJson(`/api/mag/features/${encodeURIComponent(magId)}?${magParams(params)}`, options);
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagHeatmapResponse']>} */
export function getMagHeatmap(params, options) {
  return fetchJson(`/api/mag/heatmap?${magParams(params)}`, options);
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagSamplesResponse']>} */
export function getMagSamples(params, options) {
  return fetchJson(`/api/mag/samples?${magParams(params)}`, options);
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagTaxonomyResponse']>} */
export function getMagTaxonomy(params, options) {
  return fetchJson(`/api/mag/taxonomy?${magParams(params)}`, options);
}

/** @param {MagParams} params @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['MagQualityResponse']>} */
export function getMagQuality(params, options) {
  return fetchJson(`/api/mag/quality?${magParams(params)}`, options);
}

/** @param {'features' | 'matrix' | 'samples' | 'taxonomy' | 'quality' | 'provenance'} kind @param {MagParams} params */
export function magDownloadUrl(kind, params) {
  return `${import.meta.env.VITE_API_BASE_URL || ''}/api/mag/downloads/${kind}?${magParams(params)}`;
}
