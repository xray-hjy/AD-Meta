import { useEffect, useMemo, useState } from 'react';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useScopedFeatures from '../../hooks/useScopedFeatures';

function normalizeFeature(item) {
  return {
    featureId: String(item.featureId),
    fullName: String(item.fullName || item.featureId),
    shortName: String(item.shortName || item.fullName || item.featureId),
    rank: Number(item.rank) || null,
    meanAbundance: Number(item.meanAbundance) || 0,
    detectedSampleCount: Number(item.detectedSampleCount) || 0,
    prevalence: Number(item.prevalence) || 0,
    included: item.included !== false,
  };
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export default function BoxplotFeatureSelector({
  runKey,
  artifactKey,
  scope,
  value,
  onChange,
  onApply = () => {},
  onReset = () => {},
  isDirty = false,
  dirtyCount = 0,
  applying = false,
  featureLabel = '物种',
  config = {},
}) {
  const {
    defaultLimit = 30,
    rankedLimits = [10, 20, 30, 50, 100, 200, 500],
    warningThreshold = 30,
    strongWarningThreshold = 100,
  } = config || {};
  const [search, setSearch] = useState('');
  const [seedCustomSelection, setSeedCustomSelection] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 220);
  const queryRequest = useMemo(() => ({
    scope,
    query: debouncedSearch,
    featureIds: [],
    limit: 50,
    offset: 0,
  }), [debouncedSearch, scope]);
  const featuresState = useScopedFeatures(
    runKey,
    artifactKey,
    queryRequest,
    value.mode === 'explicit'
  );
  const candidates = useMemo(
    () => (featuresState.data?.items || []).map(normalizeFeature),
    [featuresState.data?.items]
  );
  const selectedIds = useMemo(
    () => new Set(value.items.map(item => String(item.featureId))),
    [value.items]
  );
  const includedIds = useMemo(
    () => new Set(
      value.items
        .filter(item => item.included !== false)
        .map(item => String(item.featureId))
    ),
    [value.items]
  );
  const includedCount = includedIds.size;

  useEffect(() => {
    if (!seedCustomSelection || featuresState.fetching || !candidates.length) return;
    onChange(current => ({
      ...current,
      mode: 'explicit',
      items: candidates.slice(0, Math.min(defaultLimit, candidates.length)),
    }));
    setSeedCustomSelection(false);
  }, [candidates, defaultLimit, featuresState.fetching, onChange, seedCustomSelection]);

  const setMode = mode => {
    if (mode === value.mode) return;
    if (mode === 'ranked') {
      setSeedCustomSelection(false);
      onChange(current => ({ ...current, mode: 'ranked' }));
      return;
    }
    if (!value.items.length) setSeedCustomSelection(true);
    onChange(current => ({ ...current, mode: 'explicit' }));
  };

  const addFeature = feature => {
    if (selectedIds.has(feature.featureId)) return;
    onChange(current => ({
      ...current,
      mode: 'explicit',
      items: [...current.items, { ...feature, included: true }],
    }));
  };

  const removeFeature = featureId => {
    onChange(current => ({
      ...current,
      items: current.items.filter(item => String(item.featureId) !== String(featureId)),
    }));
  };

  const toggleFeature = featureId => {
    onChange(current => ({
      ...current,
      items: current.items.map(item => (
        String(item.featureId) === String(featureId)
          ? { ...item, included: item.included === false }
          : item
      )),
    }));
  };

  const shownCount = candidates.length;
  const totalCount = Number(featuresState.data?.total) || 0;

  return (
    <section className="boxplot-feature-selector" aria-label={`${featureLabel}选择`}>
      <div className="boxplot-feature-selector__heading">
        <span className="projection-controls__label">{featureLabel}选择</span>
        <div className="projection-segments" aria-label="选择方式">
          <button
            type="button"
            className={value.mode === 'ranked' ? 'is-active' : ''}
            aria-pressed={value.mode === 'ranked'}
            onClick={() => setMode('ranked')}
          >
            按丰度排名
          </button>
          <button
            type="button"
            className={value.mode === 'explicit' ? 'is-active' : ''}
            aria-pressed={value.mode === 'explicit'}
            onClick={() => setMode('explicit')}
          >
            自定义{featureLabel}
          </button>
        </div>
        <div className="boxplot-feature-selector__actions">
          {isDirty ? (
            <span className="boxplot-feature-selector__pending" aria-live="polite">
              {dirtyCount > 1 ? `有 ${dirtyCount} 项修改尚未应用` : '选择尚未应用'}
            </span>
          ) : <span className="boxplot-feature-selector__saved">选择已应用</span>}
          <button
            type="button"
            className="boxplot-feature-selector__reset"
            disabled={!isDirty || applying}
            onClick={onReset}
          >
            重置
          </button>
          <button
            type="button"
            className="boxplot-feature-selector__apply"
            disabled={!isDirty || applying || (value.mode === 'explicit' && includedCount === 0)}
            onClick={onApply}
          >
            {applying ? '计算中...' : '应用选择'}
          </button>
        </div>
      </div>

      {value.mode === 'ranked' ? (
        <div className="boxplot-feature-selector__ranked">
          <label htmlFor="boxplot-ranked-limit">参与计算的{featureLabel}数</label>
          <select
            id="boxplot-ranked-limit"
            value={value.limit || defaultLimit}
            onChange={event => onChange(current => ({
              ...current,
              limit: Number(event.target.value),
            }))}
          >
            {rankedLimits.map(limit => <option key={limit} value={limit}>Top {limit}</option>)}
          </select>
          <span>按当前分析范围内的平均丰度排名；切换范围时重新排名。</span>
        </div>
      ) : (
        <div className="boxplot-feature-selector__custom">
          <div className="boxplot-feature-selector__lookup">
            <label htmlFor="boxplot-feature-search">检索全部{featureLabel}</label>
            <input
              id="boxplot-feature-search"
              type="search"
              value={search}
              placeholder={`输入${featureLabel}名称`}
              onChange={event => setSearch(event.target.value)}
            />
            <p className="boxplot-feature-selector__status" aria-live="polite">
              {featuresState.error
                ? `候选${featureLabel}加载失败：${featuresState.error}`
                : featuresState.fetching
                  ? `正在检索${featureLabel}...`
                  : debouncedSearch
                    ? `匹配“${debouncedSearch}”：共 ${totalCount} 个${featureLabel}，当前列出前 ${shownCount} 个`
                    : `当前范围共 ${Number(featuresState.data?.sourceFeatureCount) || totalCount} 个${featureLabel}，候选区按平均丰度列出前 ${shownCount} 个`}
            </p>
            <div className="boxplot-feature-selector__candidates" role="list" aria-label={`候选${featureLabel}`}>
              {candidates.map(feature => {
                const selected = selectedIds.has(feature.featureId);
                const included = includedIds.has(feature.featureId);
                return (
                  <div
                    key={feature.featureId}
                    className={`boxplot-feature-selector__candidate${selected ? ' is-selected' : ''}${included ? ' is-included' : ''}`}
                    role="listitem"
                  >
                    <span className="boxplot-feature-selector__candidate-name" title={feature.fullName}>
                      {feature.shortName}
                    </span>
                    <small className="boxplot-feature-selector__candidate-meta">
                      {feature.rank ? `#${feature.rank} · ` : ''}
                      检出 {feature.detectedSampleCount} 样本 · {formatPercent(feature.prevalence)}
                    </small>
                    <button
                      type="button"
                      className="boxplot-feature-selector__candidate-action"
                      aria-label={selected
                        ? `从选择池移除 ${feature.shortName}`
                        : `添加到选择池 ${feature.shortName}`}
                      title={selected ? '从选择池移除' : '添加到选择池'}
                      onClick={() => (selected
                        ? removeFeature(feature.featureId)
                        : addFeature(feature))}
                    >
                      {selected ? '−' : '+'}
                    </button>
                  </div>
                );
              })}
              {!featuresState.fetching && !candidates.length ? (
                <p className="boxplot-feature-selector__empty">没有找到匹配的{featureLabel}</p>
              ) : null}
            </div>
          </div>

          <div className="boxplot-feature-selector__selected">
            <div className="boxplot-feature-selector__selected-header">
              <strong>选择池 {value.items.length} 个{featureLabel}</strong>
              <span>图表中 {includedCount} 个 · 切换 AD/NC 范围时保留此列表</span>
            </div>
            <div className="boxplot-feature-selector__selected-list">
              {value.items.map(item => {
                const included = item.included !== false;
                return (
                <span
                  key={item.featureId}
                  className={`boxplot-feature-selector__token ${included ? 'is-included' : 'is-excluded'}`}
                >
                  <button
                    type="button"
                    className="boxplot-feature-selector__token-toggle"
                    aria-pressed={included}
                    aria-label={included
                      ? `暂不在图表显示 ${item.shortName}`
                      : `加入图表显示 ${item.shortName}`}
                    title={included ? '点击后暂不加入图表' : '点击后加入图表'}
                    onClick={() => toggleFeature(item.featureId)}
                  >
                    <span>{item.shortName}</span>
                  </button>
                  <button
                    type="button"
                    className="boxplot-feature-selector__token-remove"
                    aria-label={`从选择池删除 ${item.shortName}`}
                    title="从选择池删除"
                    onClick={() => removeFeature(item.featureId)}
                  >
                    ×
                  </button>
                </span>
                );
              })}
              {seedCustomSelection ? <span className="boxplot-feature-selector__seeding">正在建立默认自定义列表...</span> : null}
            </div>
            {includedCount === 0 && value.items.length ? (
              <p className="boxplot-feature-selector__warning boxplot-feature-selector__warning--strong">
                选择池中没有参与图表的{featureLabel}，请至少启用一项后再应用。
              </p>
            ) : includedCount > strongWarningThreshold ? (
              <p className="boxplot-feature-selector__warning boxplot-feature-selector__warning--strong">
                图表中包含 {includedCount} 个{featureLabel}。系统不会删除选择，但绘制大量箱体和离群点可能降低交互性能。
              </p>
            ) : includedCount > warningThreshold ? (
              <p className="boxplot-feature-selector__warning">
                图表中包含 {includedCount} 个{featureLabel}，将保留全部结果，请使用底部滑块连续浏览。
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
