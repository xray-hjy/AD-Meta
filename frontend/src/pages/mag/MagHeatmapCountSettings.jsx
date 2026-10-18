import { useState } from 'react';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ChoiceGrid from '../../components/ui/ChoiceGrid';

// Embedded in the heatmap's settings form: confirming the count only edits its
// draft. The surrounding Apply Settings button submits all analysis settings.
export default function MagHeatmapCountSettings({ value, sourceCount, matchedCount, sampleCount, pendingFilters, loading, onChange, close }) {
  const max = Math.max(1, Math.min(1000, sourceCount || 1000));
  const [all, setAll] = useState(Number(value) === 0);
  const [draft, setDraft] = useState(String(value || 20));
  const count = Number(draft);
  const valid = /^\d+$/.test(draft) && count >= 1 && count <= max;
  const known = matchedCount != null && !pendingFilters && !loading;
  const shown = known ? (all ? matchedCount : Math.min(count, matchedCount)) : null;
  const confirm = () => {
    if (!all && !valid) return;
    onChange(all ? 0 : count);
    close();
  };
  const choose = next => { setAll(false); setDraft(String(next)); };
  return <div className="mag-top-n-settings mag-heatmap-count-settings">
    <p className="mag-top-n-settings__context">
      {sourceCount ? <>代表目录 <strong>{sourceCount.toLocaleString()} 个 MAG</strong><br /></> : null}
      {known ? <>当前条件匹配 <strong>{matchedCount.toLocaleString()} 个 MAG</strong></>
        : pendingFilters ? '筛选条件待应用，匹配数将在应用后更新。' : loading ? '正在更新匹配数量…' : '匹配数将在应用设置后显示。'}
    </p>
    <SegmentedControl className="mag-top-n-settings__modes" role="group" aria-label="热图显示范围">
      <button type="button" className="analysis-button" aria-pressed={!all} onClick={() => setAll(false)}>指定数量</button>
      <button type="button" className="analysis-button" aria-pressed={all} onClick={() => setAll(true)}>全部匹配</button>
    </SegmentedControl>
    <fieldset disabled={all}>
      <legend>常用数量</legend>
      <ChoiceGrid className="mag-top-n-settings__presets" role="group" aria-label="常用数量">
        {[10, 20, 50, 100, 200, 500].filter(n => n <= max).map(n => <button key={n} type="button" className="analysis-button"
          aria-pressed={!all && valid && count === n} onClick={() => choose(n)}>{n}</button>)}
      </ChoiceGrid>
      <label className="mag-top-n-settings__number">自定义数量
        <input aria-label="自定义热图 MAG 数量" type="text" inputMode="numeric" autoComplete="off" value={draft}
          aria-invalid={!all && !valid} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); confirm(); } }} />
      </label>
      <input className="mag-top-n-settings__slider" aria-label="拖动选择热图 MAG 数量" type="range" min="1" max={max} step="1"
        value={valid ? count : 1} onChange={event => choose(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); confirm(); } }} />
      <div className="mag-top-n-settings__limits"><span>1</span><span>{max}</span></div>
      {!all && !valid ? <p role="alert">请输入 1–{max} 之间的整数。</p> : null}
    </fieldset>
    <div className="mag-top-n-settings__summary" aria-live="polite">
      <strong>{all ? '展示全部匹配 MAG' : valid ? `最多展示 ${count} 个 MAG` : '请输入显示数量'}</strong>
      {shown != null && (all || valid) ? <span>预计矩阵：{shown.toLocaleString()} 个 MAG × {sampleCount.toLocaleString()} 个样本（{(shown * sampleCount).toLocaleString()} 个单元格）</span> : null}
      {known && !all && valid && count > matchedCount ? <span>匹配项不足时展示全部匹配项，不补入其他 MAG。</span> : null}
      <span>沿用当前选行方式；手动清单保留清单顺序。</span>
      {(all ? (shown ?? sourceCount) : count) > 100 ? <span>大矩阵可缩放查看；聚类所需时间随矩阵规模增加。</span> : null}
      {sourceCount > 1000 ? <span>指定数量最多 1,000；“全部匹配”可展示完整匹配集合。</span> : null}
    </div>
    <p>先确认数量，再点击外层“应用设置”更新热图。</p>
    <div className="mag-top-n-settings__footer">
      <button type="button" className="analysis-button" onClick={() => choose(Math.min(20, max))}>恢复 {Math.min(20, max)}</button>
      <button type="button" className="analysis-button mag-top-n-settings__apply" disabled={!all && !valid} onClick={confirm}>确认数量</button>
    </div>
  </div>;
}
