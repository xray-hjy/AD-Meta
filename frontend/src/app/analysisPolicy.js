function countGroups(samples) {
  return samples.reduce((counts, sample) => {
    const group = sample.phenotype;
    counts[group] = (counts[group] || 0) + 1;
    return counts;
  }, {});
}

export function samplesForScope(scope, samples) {
  if (scope.mode === 'cohort') return samples;
  if (scope.mode === 'group') {
    const group = scope.groups?.[0];
    return samples.filter(sample => sample.phenotype === group);
  }
  const selectedCodes = new Set(scope.sampleCodes || []);
  return samples.filter(sample => selectedCodes.has(sample.sampleCode));
}

export function validateAnalysisScope(policy, scope, samples) {
  const scopePolicy = policy?.scope || {};
  const allowed = scopePolicy.allowed || ['cohort', 'group', 'subset', 'sample'];
  if (!allowed.includes(scope.mode)) {
    return {
      valid: false,
      reason: '当前图表不支持所选分析范围',
      sampleCount: 0,
      groupCounts: {},
    };
  }

  const selected = samplesForScope(scope, samples);
  const groupCounts = countGroups(selected);
  const minPerGroup = Number(scopePolicy.minPerGroup || 0);
  const requiredGroups = scopePolicy.requiredGroups || [];
  const missing = requiredGroups.filter(group => (groupCounts[group] || 0) < minPerGroup);
  if (missing.length) {
    return {
      valid: false,
      reason: `至少需要 ${minPerGroup} 个 AD 与 ${minPerGroup} 个 NC 样本`,
      sampleCount: selected.length,
      groupCounts,
    };
  }

  const minSamples = Number(scopePolicy.minSamples || 1);
  if (selected.length < minSamples) {
    return {
      valid: false,
      reason: `至少需要 ${minSamples} 个样本`,
      sampleCount: selected.length,
      groupCounts,
    };
  }

  return {
    valid: true,
    reason: '',
    sampleCount: selected.length,
    groupCounts,
  };
}

export function scopeForMode(mode, sampleCodes = []) {
  if (mode === 'AD' || mode === 'NC') {
    return { mode: 'group', groups: [mode], sampleCodes: [] };
  }
  if (mode === 'cohort') return { mode: 'cohort', groups: [], sampleCodes: [] };
  return { mode, groups: [], sampleCodes };
}

function numericOptionValues(control) {
  return (control.options || [])
    .map(option => Number(option.value))
    .filter(Number.isFinite);
}

function resolvedSelectValue(control, value) {
  const option = (control.options || []).find(item => String(item.value) === String(value));
  return option?.value;
}

export function normalizeAnalysisParameters(policy, topN, parameters = {}) {
  const controls = policy?.controls || [];
  const topNControl = controls.find(control => control.key === 'topN');
  const parameterControls = controls.filter(control => control.key !== 'topN');
  const nextParameters = {};
  let nextTopN = Number(topN);

  if (topNControl) {
    const fallback = Number(topNControl.defaultValue);
    const options = numericOptionValues(topNControl);
    const outsideRange = Number.isFinite(nextTopN) && (
      nextTopN < Number(topNControl.min ?? nextTopN)
      || nextTopN > Number(topNControl.max ?? nextTopN)
    );
    if (!Number.isFinite(nextTopN)
      || outsideRange
      || (topNControl.input === 'select' && !options.includes(nextTopN))) {
      nextTopN = fallback;
    }
  }

  parameterControls.forEach(control => {
    if (control.input === 'select') {
      nextParameters[control.key] = resolvedSelectValue(control, parameters[control.key])
        ?? control.defaultValue;
      return;
    }
    const current = Number(parameters[control.key]);
    const fallback = Number(control.defaultValue);
    nextParameters[control.key] = Number.isFinite(current) ? current : fallback;
  });

  return {
    topN: Number.isFinite(nextTopN) ? nextTopN : Number(topNControl?.defaultValue ?? 20),
    parameters: nextParameters,
  };
}
