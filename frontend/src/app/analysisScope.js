export const DEFAULT_ANALYSIS_SCOPE = Object.freeze({
  mode: 'cohort',
  groups: [],
  sampleCodes: [],
});

const PROJECTION_STATE_STORAGE_VERSION = 'v1';

const VALID_MODES = new Set(['cohort', 'group', 'subset', 'sample']);

const PARAMETER_FIELDS = Object.freeze({
  qValueMax: { queryKey: 'q', type: 'number', min: 0.0001, max: 1 },
  log2FcMinAbs: { queryKey: 'log2fc', type: 'number', min: 0, max: 20 },
  prevalenceMin: { queryKey: 'prevalence', type: 'number', min: 0, max: 1 },
  abundanceThreshold: { queryKey: 'detection', type: 'number', min: 0, max: 1_000_000_000 },
  filterPreset: {
    queryKey: 'pcoaFilter',
    type: 'choice',
    choices: ['unfiltered', 'inclusive', 'standard', 'robust'],
  },
});

function controlDefaultValue(control) {
  return control.input === 'select'
    ? control.defaultValue
    : Number(control.defaultValue);
}

function policyDefaults(policy) {
  const controls = policy?.controls || [];
  const topNControl = controls.find(control => control.key === 'topN');
  const parameters = controls
    .filter(control => control.key !== 'topN' && control.defaultValue != null)
    .reduce((result, control) => {
      result[control.key] = controlDefaultValue(control);
      return result;
    }, {});
  return {
    scope: { ...DEFAULT_ANALYSIS_SCOPE },
    topN: Number(topNControl?.defaultValue ?? 20),
    parameters,
  };
}

function readParameters(searchParams, defaults = {}) {
  const parameters = { ...defaults };
  return Object.entries(PARAMETER_FIELDS).reduce((result, [key, definition]) => {
    const raw = searchParams.get(definition.queryKey);
    if (raw == null || raw === '') return result;
    if (definition.type === 'choice') {
      if (definition.choices.includes(raw)) result[key] = raw;
      return result;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      result[key] = Math.max(definition.min, Math.min(definition.max, value));
    }
    return result;
  }, parameters);
}

export function defaultProjectionState(policy) {
  return policyDefaults(policy);
}

export function readProjectionState(searchParams, policy = null) {
  const defaults = policyDefaults(policy);
  const requestedMode = searchParams.get('scope') || 'cohort';
  const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'cohort';
  const sampleCodes = (searchParams.get('samples') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const group = searchParams.get('group');
  const rawTopN = searchParams.get('topN');
  const topNValue = rawTopN == null || rawTopN === '' ? Number.NaN : Number(rawTopN);
  const topN = Number.isFinite(topNValue)
    ? Math.max(1, Math.min(500, Math.round(topNValue)))
    : defaults.topN;
  const parameters = readParameters(searchParams, defaults.parameters);

  if (mode === 'group' && (group === 'AD' || group === 'NC')) {
    return { scope: { mode, groups: [group], sampleCodes: [] }, topN, parameters };
  }
  if (mode === 'sample' && sampleCodes.length === 1) {
    return { scope: { mode, groups: [], sampleCodes }, topN, parameters };
  }
  if (mode === 'subset' && sampleCodes.length >= 2) {
    return { scope: { mode, groups: [], sampleCodes }, topN, parameters };
  }
  return { scope: { ...DEFAULT_ANALYSIS_SCOPE }, topN, parameters };
}

export function projectionStateStorageKey(runKey, artifactKey, chartKey) {
  if (!runKey || !artifactKey || !chartKey) return '';
  return [
    'admeta',
    'projection-state',
    PROJECTION_STATE_STORAGE_VERSION,
    encodeURIComponent(runKey),
    encodeURIComponent(artifactKey),
    encodeURIComponent(chartKey),
  ].join(':');
}

export function loadProjectionState(storage, runKey, artifactKey, chartKey) {
  const key = projectionStateStorageKey(runKey, artifactKey, chartKey);
  if (!storage || !key) return null;
  try {
    const value = JSON.parse(storage.getItem(key));
    if (!value || typeof value !== 'object' || !value.scope) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveProjectionState(storage, runKey, artifactKey, chartKey, state) {
  const key = projectionStateStorageKey(runKey, artifactKey, chartKey);
  if (!storage || !key || !state?.scope) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // A blocked or full session store must not prevent chart navigation.
  }
}

export function projectionSearchUpdates(scope, topN, parameters = {}) {
  const updates = {
    scope: scope.mode,
    group: scope.mode === 'group' ? scope.groups[0] : null,
    samples: ['sample', 'subset'].includes(scope.mode)
      ? scope.sampleCodes.join(',')
      : null,
    topN: String(topN),
  };
  Object.entries(PARAMETER_FIELDS).forEach(([key, definition]) => {
    updates[definition.queryKey] = parameters[key] == null
      ? null
      : String(parameters[key]);
  });
  return updates;
}
