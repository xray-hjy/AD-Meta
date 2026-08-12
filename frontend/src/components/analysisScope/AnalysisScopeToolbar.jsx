import { useEffect, useMemo, useState } from 'react';
import {
  normalizeAnalysisParameters,
  scopeForMode,
  validateAnalysisScope,
} from '../../app/analysisPolicy';

const MODE_OPTIONS = [
  { key: 'cohort', label: '全部样本' },
  { key: 'AD', label: 'AD 组' },
  { key: 'NC', label: 'NC 组' },
  { key: 'subset', label: '自定义子集' },
  { key: 'sample', label: '单个样本' },
];

function selectedMode(scope) {
  return scope.mode === 'group' ? scope.groups[0] : scope.mode;
}

export default function AnalysisScopeToolbar({
  scope,
  topN,
  parameters = {},
  samples,
  samplesLoading,
  featureLabel,
  supportedScopes = ['cohort', 'group', 'subset', 'sample'],
  controls = [],
  scopeRequirement = '',
  analysisPolicy = null,
  chartControls = null,
  onChange,
}) {
  const [query, setQuery] = useState('');
  const [draftCodes, setDraftCodes] = useState(scope.sampleCodes);
  const [selectionMode, setSelectionMode] = useState(selectedMode(scope));
  const [draftTopN, setDraftTopN] = useState(topN);
  const [draftParameters, setDraftParameters] = useState(parameters);

  useEffect(() => {
    setDraftCodes(scope.sampleCodes);
    setSelectionMode(selectedMode(scope));
  }, [scope]);
  useEffect(() => setDraftTopN(topN), [topN]);
  useEffect(() => setDraftParameters(parameters), [parameters]);

  const filteredSamples = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return samples;
    return samples.filter(sample => sample.sampleCode.toLowerCase().includes(term));
  }, [query, samples]);

  const mode = selectionMode;
  const resolvedPolicy = useMemo(() => analysisPolicy || ({
    scope: {
      allowed: supportedScopes,
      requirement: scopeRequirement,
    },
    controls,
  }), [analysisPolicy, controls, scopeRequirement, supportedScopes]);
  const allowedScopes = resolvedPolicy.scope?.allowed || supportedScopes;
  const resolvedControls = resolvedPolicy.controls || controls;
  const visibleOptions = MODE_OPTIONS.filter(option => {
    const scopeMode = option.key === 'AD' || option.key === 'NC' ? 'group' : option.key;
    return allowedScopes.includes(scopeMode);
  });
  const topNControl = useMemo(
    () => resolvedControls.find(control => control.key === 'topN'),
    [resolvedControls]
  );
  const parameterControls = useMemo(
    () => resolvedControls.filter(control => control.key !== 'topN'),
    [resolvedControls]
  );
  const currentScopeSupported = allowedScopes.includes(scope.mode);
  const currentValidation = useMemo(
    () => validateAnalysisScope(resolvedPolicy, scope, samples),
    [resolvedPolicy, scope, samples]
  );
  const draftSubsetScope = useMemo(
    () => scopeForMode('subset', draftCodes),
    [draftCodes]
  );
  const subsetValidation = useMemo(
    () => validateAnalysisScope(resolvedPolicy, draftSubsetScope, samples),
    [draftSubsetScope, resolvedPolicy, samples]
  );
  useEffect(() => {
    const normalized = normalizeAnalysisParameters(resolvedPolicy, topN, parameters);
    const parametersChanged = JSON.stringify(normalized.parameters) !== JSON.stringify(parameters);
    if (normalized.topN === Number(topN) && !parametersChanged) return;
    setDraftTopN(normalized.topN);
    setDraftParameters(normalized.parameters);
    onChange(scope, normalized.topN, normalized.parameters);
  }, [onChange, parameters, resolvedPolicy, scope, topN]);
  const commit = (nextScope = scope, nextTopN = topN, nextParameters = draftParameters) => {
    onChange(nextScope, nextTopN, nextParameters);
  };
  const changeMode = nextMode => {
    setSelectionMode(nextMode);
    if (nextMode === 'AD' || nextMode === 'NC') {
      commit(scopeForMode(nextMode));
      return;
    }
    if (nextMode === 'cohort') {
      commit(scopeForMode('cohort'));
      return;
    }
    const initialCodes = nextMode === 'sample'
      ? draftCodes.slice(0, 1)
      : draftCodes.length >= 2 ? draftCodes : [];
    setDraftCodes(initialCodes);
    if (initialCodes.length >= (nextMode === 'sample' ? 1 : 2)) {
      commit({ mode: nextMode, groups: [], sampleCodes: initialCodes });
    }
  };

  const toggleSubsetSample = code => {
    setDraftCodes(current => current.includes(code)
      ? current.filter(item => item !== code)
      : [...current, code]);
  };

  return (
    <div className="projection-controls">
      <div className="projection-controls__primary">
        <div className="projection-controls__group">
          <span className="projection-controls__label">分析范围</span>
          <div className="projection-segments" role="group" aria-label="分析范围">
            {visibleOptions.map(option => (
              <button
                key={option.key}
                type="button"
                className={mode === option.key ? 'is-active' : ''}
                aria-pressed={mode === option.key}
                onClick={() => changeMode(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {topNControl ? <div className="projection-controls__top-n">
          <label htmlFor="projection-top-n">
            {topNControl.label || `Top N ${featureLabel}`}
            <small aria-hidden="true">{topNControl.purpose === 'feature_selection' ? '计算参数' : '展示设置'}</small>
          </label>
          {topNControl.input === 'select' ? (
            <select
              id="projection-top-n"
              aria-label={topNControl.label || `Top N ${featureLabel}`}
              value={draftTopN}
              onChange={event => {
                const nextValue = Number(event.target.value);
                setDraftTopN(nextValue);
                commit(scope, nextValue);
              }}
            >
              {(topNControl.options || []).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : <>
            <input
              id="projection-top-n"
              type="range"
              min={topNControl.min || 1}
              max={topNControl.max || 500}
              value={draftTopN}
              onChange={event => setDraftTopN(Number(event.target.value))}
              onPointerUp={event => commit(scope, Number(event.currentTarget.value))}
              onKeyUp={event => commit(scope, Number(event.currentTarget.value))}
            />
            <input
              type="number"
              min={topNControl.min || 1}
              max={topNControl.max || 500}
              value={draftTopN}
              aria-label={`Top N ${featureLabel}`}
              onChange={event => {
                setDraftTopN(Math.max(topNControl.min || 1, Math.min(topNControl.max || 500, Number(event.target.value) || 1)));
              }}
              onBlur={event => commit(scope, Number(event.currentTarget.value))}
              onKeyDown={event => {
                if (event.key === 'Enter') commit(scope, Number(event.currentTarget.value));
              }}
            />
          </>}
        </div> : null}
      </div>

      {parameterControls.length ? (
        <div className="projection-controls__parameters" aria-label="科学筛选参数">
          {parameterControls.map(control => {
            const value = draftParameters[control.key] ?? control.defaultValue;
            return (
              <label key={control.key}>
                <span>{control.label}<small aria-hidden="true">分析筛选</small></span>
                {control.input === 'select' ? (
                  <select
                    aria-label={control.label}
                    value={value}
                    onChange={event => {
                      const selected = (control.options || []).find(
                        option => String(option.value) === event.target.value
                      );
                      const nextValue = selected?.value ?? control.defaultValue;
                      const next = { ...draftParameters, [control.key]: nextValue };
                      setDraftParameters(next);
                      commit(scope, topN, next);
                    }}
                  >
                    {(control.options || []).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}

      {chartControls ? (
        <div className="projection-controls__chart">{chartControls}</div>
      ) : null}

      {!currentScopeSupported ? (
        <p className="projection-controls__notice">
          当前图不支持“{MODE_OPTIONS.find(option => option.key === mode)?.label || mode}”，请选择上方可用范围。
        </p>
      ) : !samplesLoading && !currentValidation.valid ? (
        <p className="projection-controls__notice">当前范围不可计算：{currentValidation.reason}</p>
      ) : resolvedPolicy.scope?.requirement ? (
        <p className="projection-controls__hint">范围要求：{resolvedPolicy.scope.requirement}</p>
      ) : null}

      {currentScopeSupported && mode === 'sample' ? (
        <div className="projection-sample-picker">
          <label htmlFor="single-analysis-sample">选择样本</label>
          <select
            id="single-analysis-sample"
            value={scope.mode === 'sample' ? scope.sampleCodes[0] || '' : ''}
            disabled={samplesLoading}
            onChange={event => {
              const sampleCode = event.target.value;
              if (sampleCode) commit({ mode: 'sample', groups: [], sampleCodes: [sampleCode] });
            }}
          >
            <option value="">{samplesLoading ? '正在读取样本...' : '请选择样本'}</option>
            {samples.map(sample => (
              <option key={sample.sampleCode} value={sample.sampleCode}>
                {sample.sampleCode} · {sample.phenotype}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {currentScopeSupported && mode === 'subset' ? (
        <div className="projection-subset-picker">
          <div className="projection-subset-picker__header">
            <label htmlFor="subset-sample-search">选择至少两个样本</label>
            <input
              id="subset-sample-search"
              type="search"
              value={query}
              placeholder="搜索样本编号"
              onChange={event => setQuery(event.target.value)}
            />
            <span>
              已选 {draftCodes.length} · AD {subsetValidation.groupCounts.AD || 0} · NC {subsetValidation.groupCounts.NC || 0}
            </span>
            <button
              type="button"
              disabled={!subsetValidation.valid}
              onClick={() => commit({ mode: 'subset', groups: [], sampleCodes: draftCodes })}
            >
              应用范围
            </button>
          </div>
          {!subsetValidation.valid ? (
            <p className="projection-subset-picker__validation">{subsetValidation.reason}</p>
          ) : null}
          <div className="projection-subset-picker__list">
            {filteredSamples.map(sample => (
              <label key={sample.sampleCode}>
                <input
                  type="checkbox"
                  checked={draftCodes.includes(sample.sampleCode)}
                  onChange={() => toggleSubsetSample(sample.sampleCode)}
                />
                <span>{sample.sampleCode}</span>
                <small>{sample.phenotype}</small>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
