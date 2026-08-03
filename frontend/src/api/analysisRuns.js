import { fetchJson } from './client';

export function listAnalysisRuns(options) {
  return fetchJson('/api/analysis-runs', options);
}

export function getAnalysisRun(runKey, options) {
  return fetchJson(`/api/analysis-runs/${runKey}`, options);
}

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

export function listScopedAnalysisSamples(runKey, artifactKey, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/samples/query`,
    { ...options, method: 'POST', body: request }
  );
}

export function projectAbundance(runKey, artifactKey, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projections/abundance`,
    { ...options, method: 'POST', body: request }
  );
}

export function projectChart(runKey, artifactKey, projectionKind, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projections/${projectionKind}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request }
  );
}

export function getProjectionAudit(runKey, artifactKey, projectionKind, request, options = {}) {
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request }
  );
}

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

export function getProjectionAuditOptions(
  runKey,
  artifactKey,
  projectionKind,
  field,
  request,
  { query = '', limit = 500, ...options } = {},
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set('query', query);
  return fetchJson(
    `/api/analysis-runs/${runKey}/artifacts/${artifactKey}/projection-audits/${projectionKind}/options/${field}?${params}`,
    { timeoutMs: 120_000, ...options, method: 'POST', body: request },
  );
}

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
