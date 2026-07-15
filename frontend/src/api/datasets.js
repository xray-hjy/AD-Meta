import { fetchJson } from './client';

/** @typedef {import('./generated').components['schemas']['DatasetResponse']} Dataset */
/** @typedef {import('./generated').components['schemas']['SummaryResponse']} DatasetSummary */

export function listDatasets(options) {
  return fetchJson('/api/datasets', options);
}

export function getDataset(slug, options) {
  return fetchJson(`/api/datasets/${slug}`, options);
}

export function getDatasetSummary(slug, options) {
  return fetchJson(`/api/datasets/${slug}/summary`, options);
}

export function getChart(slug, chartType, options) {
  return fetchJson(`/api/datasets/${slug}/charts/${chartType}`, options);
}
