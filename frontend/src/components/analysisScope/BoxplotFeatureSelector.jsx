import { useEffect, useMemo, useRef, useState } from 'react';
import StyledSelect from '../ui/StyledSelect';
import SegmentedControl from '../ui/SegmentedControl';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useScopedFeatures from '../../hooks/useScopedFeatures';
import EntityAutocomplete from '../ui/EntityAutocomplete';
import EvidenceLink from '../evidence/EvidenceLink';
import './boxplot-feature-selector.css';

const PAGE_SIZE = 50;
const EMPTY_ITEMS = [];

function normalizeFeature(item) {
  return {
    featureId: String(item.featureId),
    fullName: String(item.fullName || item.featureId),
    shortName: String(item.shortName || item.fullName || item.featureId),
    rank: Number(item.rank) || null,
    detectedSampleCount: Number(item.detectedSampleCount) || 0,
    prevalence: Number(item.prevalence) || 0,
    included: item.included !== false,
  };
}

function FeatureIdentity({ feature }) {
  return <details className="boxplot-feature-identity">
    <summary>完整名称与 ID</summary>
    <span>{feature.fullName}</span><code>{feature.featureId}</code>
  </details>;
}

export default function BoxplotFeatureSelector({
  runKey, artifactKey, scope, value, onChange,
  onApply = () => {}, onReset = () => {}, isDirty = false, dirtyCount = 0,
  applying = false, refreshError = null, plottedItems = EMPTY_ITEMS, featureLabel = '物种', evidenceEnabled = false, config = {},
}) {
  const { defaultLimit = 30, rankedLimits = [10, 20, 30, 50, 100, 200, 500],
    warningThreshold = 30, strongWarningThreshold = 100 } = config || {};
  const [search, setSearch] = useState('');
  const [poolSearch, setPoolSearch] = useState('');
  const [poolFilter, setPoolFilter] = useState('all');
  const [pagination, setPagination] = useState({ identity: '', offset: 0 });
  const listRef = useRef(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 220);
  const identity = JSON.stringify([runKey, artifactKey, scope, debouncedSearch]);
  // A new search or scope always starts on page one, without an intermediate old-page request.
  const offset = pagination.identity === identity ? pagination.offset : 0;
  const queryRequest = useMemo(() => ({ scope, query: debouncedSearch, featureIds: [], limit: PAGE_SIZE, offset }),
    [debouncedSearch, offset, scope]);
  const featuresState = useScopedFeatures(runKey, artifactKey, queryRequest, value.mode === 'explicit');
  const busy = featuresState.fetching || featuresState.loading || featuresState.placeholder || debouncedSearch !== search.trim();
  const candidates = useMemo(() => busy || featuresState.error ? [] : (featuresState.data?.items || []).map(normalizeFeature),
    [busy, featuresState.data?.items, featuresState.error]);
  const selectedIds = useMemo(() => new Set(value.items.map(item => String(item.featureId))), [value.items]);
  const includedCount = value.items.filter(item => item.included !== false).length;
  const filteredPool = useMemo(() => {
    const term = poolSearch.trim().toLocaleLowerCase();
    return value.items.filter(item => (
      (poolFilter === 'all' || (item.included !== false) === (poolFilter === 'included'))
      && (!term || [item.fullName, item.shortName, item.featureId].some(text => String(text).toLocaleLowerCase().includes(term)))
    ));
  }, [poolFilter, poolSearch, value.items]);
  const totalCount = Number(featuresState.data?.total) || 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  useEffect(() => { setPagination({ identity, offset: 0 }); }, [identity]);
  useEffect(() => { listRef.current?.scrollTo?.({ top: 0 }); }, [identity, offset]);

  const addFeature = feature => onChange(current => current.items.some(item => String(item.featureId) === feature.featureId) ? current : ({
    ...current, mode: 'explicit', items: [...current.items, { ...feature, included: true }],
  }));
  const removeFeature = featureId => onChange(current => ({
    ...current, items: current.items.filter(item => String(item.featureId) !== String(featureId)),
  }));
  const toggleFeature = featureId => onChange(current => ({
    ...current, items: current.items.map(item => String(item.featureId) === String(featureId)
      ? { ...item, included: item.included === false } : item),
  }));
  const setAllIncluded = included => onChange(current => ({
    ...current, items: current.items.map(item => ({ ...item, included })),
  }));
  const importPlotted = () => onChange(current => {
    const ids = new Set(current.items.map(item => String(item.featureId)));
    return { ...current, mode: 'explicit', items: [...current.items,
      ...plottedItems.filter(item => !ids.has(String(item.featureId))).map(item => ({ ...normalizeFeature(item), included: true }))] };
  });

  return <section className="boxplot-feature-selector" aria-label={`${featureLabel}选择`}>
    <fieldset className="boxplot-selector-fields" disabled={applying}>
      <legend className="projection-controls__label">{featureLabel}选择</legend>
      <SegmentedControl className="projection-segments" role="group" aria-label="选择方式">
        <button type="button" className={value.mode === 'ranked' ? 'is-active' : ''} aria-pressed={value.mode === 'ranked'}
          onClick={() => onChange(current => ({ ...current, mode: 'ranked' }))}>按丰度排名</button>
        <button type="button" className={value.mode === 'explicit' ? 'is-active' : ''} aria-pressed={value.mode === 'explicit'}
          onClick={() => onChange(current => ({ ...current, mode: 'explicit' }))}>自定义{featureLabel}</button>
      </SegmentedControl>
      {value.mode === 'ranked' ? <div className="boxplot-selector-ranked">
        <label htmlFor="boxplot-ranked-limit">参与计算的{featureLabel}数</label>
        <StyledSelect id="boxplot-ranked-limit" value={value.limit || defaultLimit}
          onChange={event => onChange(current => ({ ...current, limit: Number(event.target.value) }))}>
          {rankedLimits.map(limit => <option key={limit} value={limit}>Top {limit}</option>)}
        </StyledSelect>
        <p>按当前分析范围内的平均丰度降序排名，包含零值；切换范围时重新排名。</p>
        <button type="button" className="analysis-button" disabled={!plottedItems.length} onClick={importPlotted}>将当前图表对象加入池</button>
        <p>已保留的自定义对象池：{value.items.length} 个。切换选择方式不会清空对象池。</p>
      </div> : <>
        <div className="boxplot-selector-lookup">
          <label htmlFor="boxplot-feature-search">检索全部{featureLabel}</label>
          <EntityAutocomplete id="boxplot-feature-search" label={`检索全部${featureLabel}`} value={search}
            placeholder={`输入${featureLabel}名称或分类路径`} onChange={setSearch}
            onSelect={id => { const feature = candidates.find(item => item.featureId === id); if (feature) { addFeature(feature); setSearch(''); } }}
            items={candidates.slice(0, 20).map(feature => ({ key: feature.featureId, value: feature.featureId,
              label: feature.shortName, detail: feature.fullName, kind: selectedIds.has(feature.featureId) ? '已入池' : featureLabel }))}
            total={totalCount} loading={busy} error={featuresState.error}
            note="选择加入对象池，应用后更新图表；全部匹配结果见下方列表" />
          <p className="boxplot-selector-status" aria-live="polite">
            {featuresState.error ? `候选${featureLabel}加载失败：${featuresState.error}` : busy ? `正在检索${featureLabel}...`
              : `共 ${totalCount} 个${debouncedSearch ? '匹配结果' : featureLabel} · 本页 ${candidates.length ? offset + 1 : 0}–${offset + candidates.length}`}
          </p>
          <div className="boxplot-selector-candidates" ref={listRef} role="list" aria-label={`候选${featureLabel}`} aria-busy={busy || undefined}>
            {candidates.map(feature => {
              const selected = selectedIds.has(feature.featureId);
              return <div key={feature.featureId} className={`boxplot-selector-candidate${selected ? ' is-selected' : ''}`} role="listitem">
                <div className="boxplot-selector-name"><strong>{feature.shortName}</strong>
                  <small>#{feature.rank} · 检出 {feature.detectedSampleCount} 样本 · {(feature.prevalence * 100).toFixed(1)}%</small>
                  <FeatureIdentity feature={feature} />
                </div>
                <div className="boxplot-selector-row-actions">
                  <button type="button" className="analysis-button" disabled={selected} aria-label={`添加到对象池 ${feature.shortName}`}
                    onClick={() => addFeature(feature)}>{selected ? '已入池' : '加入池'}</button>
                  {evidenceEnabled && !isDirty ? <EvidenceLink subjectId={feature.featureId} /> : null}
                </div>
              </div>;
            })}
            {!busy && !featuresState.error && !candidates.length ? <p className="boxplot-selector-status">没有找到匹配的{featureLabel}</p> : null}
          </div>
          <nav className="boxplot-selector-pagination" aria-label={`候选${featureLabel}分页`}>
            <button type="button" className="analysis-button" disabled={busy || Boolean(featuresState.error) || page <= 1}
              onClick={() => setPagination({ identity, offset: Math.max(0, offset - PAGE_SIZE) })}>上一页候选</button>
            <span>{busy ? '检索中' : `第 ${page} / ${pageCount} 页`}</span>
            <button type="button" className="analysis-button" disabled={busy || Boolean(featuresState.error) || page >= pageCount}
              onClick={() => setPagination({ identity, offset: offset + PAGE_SIZE })}>下一页候选</button>
          </nav>
        </div>
        <div className="boxplot-selector-pool">
          <div className="boxplot-selector-pool-heading"><strong>对象池 {value.items.length} 个{featureLabel}</strong><span>待绘图 {includedCount} 个</span></div>
          <p className="boxplot-selector-status">取消勾选可暂不绘图，仍保留在池中；切换 AD/NC 范围保留对象池。</p>
          <label className="boxplot-selector-pool-search">池内搜索<input type="search" value={poolSearch} placeholder="名称或 ID"
            onChange={event => setPoolSearch(event.target.value)} /></label>
          <label className="boxplot-selector-pool-filter">池内状态<StyledSelect value={poolFilter} onChange={event => setPoolFilter(event.target.value)}>
            <option value="all">全部对象（{value.items.length}）</option><option value="included">参与绘图（{includedCount}）</option>
            <option value="excluded">暂不绘图（{value.items.length - includedCount}）</option>
          </StyledSelect></label>
          <div className="boxplot-selector-batch">
            <button type="button" className="analysis-button" disabled={!value.items.length || includedCount === value.items.length} onClick={() => setAllIncluded(true)}>全池参与绘图</button>
            <button type="button" className="analysis-button" disabled={!includedCount} onClick={() => setAllIncluded(false)}>全池暂不绘图</button>
          </div>
          <div className="boxplot-selector-pool-list" role="list" aria-label="对象池列表">
            {filteredPool.map(item => <div key={item.featureId} className={`boxplot-selector-pool-item${item.included === false ? ' is-excluded' : ''}`} role="listitem">
              <div className="boxplot-selector-name">
                <label><input type="checkbox" checked={item.included !== false} aria-label={`参与绘图 ${item.shortName}`}
                  onChange={() => toggleFeature(item.featureId)} /><strong>{item.shortName}</strong></label>
                <small>{item.included === false ? '暂不绘图 · 保留在池中' : '参与绘图 · 应用后生效'}</small>
                <FeatureIdentity feature={item} />
              </div>
              <div className="boxplot-selector-row-actions">
                <button type="button" className="analysis-button" aria-label={`从对象池移除 ${item.shortName}`} onClick={() => removeFeature(item.featureId)}>移除</button>
                {evidenceEnabled && !isDirty ? <EvidenceLink subjectId={item.featureId}>评估</EvidenceLink> : null}
              </div>
            </div>)}
            {!value.items.length ? <p className="boxplot-selector-status">对象池为空。从上方加入第一个{featureLabel}，再逐步增加。</p>
              : !filteredPool.length ? <p className="boxplot-selector-status">池内没有匹配对象；筛选不会移除已选对象。</p> : null}
          </div>
          {plottedItems.length ? <button type="button" className="analysis-button" onClick={importPlotted}>将当前图表对象加入池</button> : null}
          {includedCount === 0 && value.items.length ? <p className="boxplot-selector-warning">请至少勾选一个绘图对象后再应用。</p>
            : includedCount > strongWarningThreshold ? <p className="boxplot-selector-warning">待绘图 {includedCount} 个{featureLabel}，绘制大量箱体与离群点可能降低交互性能。</p>
              : includedCount > warningThreshold ? <p className="boxplot-selector-status">将保留全部 {includedCount} 个绘图对象，可通过图表底部滑块连续浏览。</p> : null}
        </div>
      </>}
    </fieldset>
    <div className="boxplot-selector-apply">
      <div aria-live="polite"><strong>当前图表 {plottedItems.length} 个{featureLabel}</strong>
        <span className={isDirty || refreshError ? 'boxplot-selector-warning' : ''}>{applying ? '正在计算，当前图表仍为上一版本'
          : refreshError ? '计算失败，图表仍为上一版本；请在右侧重试'
            : isDirty ? `${dirtyCount > 1 ? `有 ${dirtyCount} 项修改` : '选择'}尚未应用` : '选择已应用'}</span>
      </div>
      <div className="boxplot-selector-apply-buttons">
        <button type="button" className="analysis-button" disabled={!isDirty || applying} onClick={onReset}>撤销未应用修改</button>
        <button type="button" className="analysis-button analysis-button--primary" disabled={!isDirty || applying || (value.mode === 'explicit' && includedCount === 0)} onClick={onApply}>
          {applying ? '计算中...' : '应用选择'}</button>
      </div>
    </div>
  </section>;
}
