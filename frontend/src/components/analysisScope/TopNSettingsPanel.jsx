import { useState } from 'react';

export default function TopNSettingsPanel({ control, value, featureLabel, availableCount, loading, onChange, close }) {
  const [draft, setDraft] = useState(String(value));
  const [all, setAll] = useState(false);
  const min = control.min || 1, max = control.max || 500;
  const count = Number(draft);
  const valid = /^\d+$/.test(draft) && count >= min && count <= max;
  const known = Number.isInteger(availableCount) && !loading;
  const computation = control.purpose === 'feature_selection';
  const canShowAll = !computation && known && availableCount >= min && availableCount <= max;
  const presets = [...new Set([...(control.presets || [10, 20, 30, 50, 100, 200, 500]), control.defaultValue])]
    .filter(n => n >= min && n <= max).sort((a, b) => a - b);
  const choose = n => { setAll(false); setDraft(String(n)); };
  const apply = () => { if (!(all ? canShowAll : valid)) return; onChange(all ? availableCount : count); close(); };
  return <div>
    <p>{loading ? '正在更新当前范围的可选数量…' : known ? <>当前范围可选 <strong>{availableCount.toLocaleString()} 个{featureLabel}</strong></> : '可选数量将在分析结果返回后更新。'}</p>
    {!computation ? <div className="selection-count-modes">
      <button type="button" className="analysis-button" aria-pressed={!all} onClick={() => setAll(false)}>Top N</button>
      <button type="button" className="analysis-button" aria-pressed={all} disabled={!canShowAll} onClick={() => setAll(true)}>全部匹配</button>
    </div> : null}
    <p>常用数量</p>
    <div className="selection-count-presets">{presets.map(n => <button key={n} type="button" className="analysis-button"
      aria-pressed={!all && count === n} onClick={() => choose(n)}>Top {n}</button>)}</div>
    <label className="selection-count-number">自定义 Top N<input type="text" inputMode="numeric" value={draft} disabled={all}
      aria-label={`自定义 Top N ${featureLabel}`} aria-invalid={!all && !valid} onChange={event => setDraft(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply(); } }} /></label>
    <input type="range" className="selection-count-range" min={min} max={max} step="1" value={valid ? count : min} disabled={all}
      aria-label={`拖动选择 ${featureLabel} 数量`} onChange={event => choose(event.target.value)} />
    <div className="selection-count-limits"><span>{min}</span><span>{max}</span></div>
    {!all && !valid ? <p role="alert">请输入 {min}–{max} 之间的整数。</p> : null}
    <div className="selection-count-summary">
      <strong>{all && canShowAll ? `展示全部 ${availableCount} 个${featureLabel}` : valid ? `${computation ? '选取参与计算' : '最多展示'} ${count} 个${featureLabel}` : '请输入有效数量'}</strong>
      <span>{computation ? '应用后重新选取特征并计算结果；可能改变坐标和解释率。' : '沿用当前排名和筛选条件，列表查询与排序独立。'}</span>
      {!computation && valid && known && count > availableCount ? <span>匹配不足时仅展示实际匹配项，不补入其他特征。</span> : null}
      {known && availableCount > max ? <span>当前图数量上限为 {max}；完整结果可在查询与下载区域查看。</span> : null}
    </div>
    <div className="selection-count-actions">
      <button type="button" className="analysis-button" onClick={() => choose(control.defaultValue || 20)}>推荐数量</button>
      <button type="button" className="analysis-button selection-count-apply" disabled={all ? !canShowAll : !valid} onClick={apply}>应用</button>
    </div>
  </div>;
}
