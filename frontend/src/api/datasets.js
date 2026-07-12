import { fetchJson } from './client';

export function listDatasets() {
  return fetchJson('/api/datasets');
}

export function getDataset(slug) {
  return fetchJson(`/api/datasets/${slug}`);
}

export function getDatasetSummary(slug) {
  return fetchJson(`/api/datasets/${slug}/summary`);
}

export function getChart(slug, chartType) {
  return fetchJson(`/api/datasets/${slug}/charts/${chartType}`);
}
