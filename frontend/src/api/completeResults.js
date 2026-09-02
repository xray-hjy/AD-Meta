import { fetchJson } from './client';

/** @typedef {import('./client').FetchJsonOptions} FetchJsonOptions */
/** @param {string} runKey @param {string} artifactKey @param {Record<string, string | number>} params */
function resultPath(runKey, artifactKey, params) {
  const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return `/api/analysis-runs/${encodeURIComponent(runKey)}/artifacts/${encodeURIComponent(artifactKey)}/results?${search}`;
}

/** @param {string} runKey @param {string} artifactKey @param {Record<string, string | number>} params
 * @param {FetchJsonOptions} [options]
 * @returns {Promise<import('./generated').components['schemas']['CompleteResultPageResponse']>} */
export function getCompleteResults(runKey, artifactKey, params, options) {
  return fetchJson(resultPath(runKey, artifactKey, params), options);
}

/** @param {string} runKey @param {string} artifactKey @param {Record<string, string | number>} params */
export function completeResultsDownloadUrl(runKey, artifactKey, params) {
  const { limit: _limit, offset: _offset, ...filters } = params;
  return `${import.meta.env.VITE_API_BASE_URL || ''}${resultPath(runKey, artifactKey, filters).replace('/results?', '/results/download?')}`;
}
