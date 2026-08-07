import { fetchJson } from './client';

/** @typedef {import('./generated').components['schemas']['DatasetResponse']} Dataset */
/** @typedef {import('./generated').components['schemas']['SummaryResponse']} DatasetSummary */
/** @typedef {import('./generated').components['schemas']['ChartArtifactResponse']} ChartArtifact */
/** @typedef {import('./client').FetchJsonOptions} FetchJsonOptions */

/** @param {FetchJsonOptions} [options] @returns {Promise<Dataset[]>} */
export function listDatasets(options) {
  return fetchJson('/api/datasets', options);
}

/** @param {string} slug @param {FetchJsonOptions} [options] @returns {Promise<DatasetSummary>} */
export function getDatasetSummary(slug, options) {
  return fetchJson(`/api/datasets/${slug}/summary`, options);
}

/**
 * @param {string} slug
 * @param {string} chartType
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<ChartArtifact>}
 */
export function getChart(slug, chartType, options) {
  return fetchJson(`/api/datasets/${slug}/charts/${chartType}`, options);
}
