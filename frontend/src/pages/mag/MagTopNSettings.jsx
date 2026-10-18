import { useState } from 'react';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ChoiceGrid from '../../components/ui/ChoiceGrid';

export default function MagTopNSettings({ value, matchedCount, loading, onApply, close }) {
  const max = Math.max(1, matchedCount);
  const [all, setAll] = useState(value === 0);
  const [draft, setDraft] = useState(String(Math.min(value || 20, max)));
  const number = Number(draft);
  const valid = draft !== '' && Number.isInteger(number) && number >= 1 && number <= max;
  const choose = next => { setAll(false); setDraft(String(next)); };
  return <form className="mag-top-n-settings" onSubmit={event => {
    event.preventDefault();
    if (loading || !matchedCount || (!all && !valid)) return;
    onApply(all ? 0 : number); close();
  }}>
    <p className="mag-top-n-settings__context">{loading ? '正在更新匹配数量…' : <>当前搜索匹配 <strong>{matchedCount.toLocaleString()} 个 MAG</strong></>}</p>
    <SegmentedControl className="mag-top-n-settings__modes" role="group" aria-label="显示范围">
      <button type="button" className="analysis-button" aria-pressed={!all} onClick={() => setAll(false)}>Top N</button>
      <button type="button" className="analysis-button" aria-pressed={all} onClick={() => setAll(true)}>全部匹配</button>
    </SegmentedControl>
    <fieldset disabled={all}>
      <legend>常用数量</legend>
      <ChoiceGrid className="mag-top-n-settings__presets" role="group" aria-label="常用数量">
        {[10, 20, 30, 50, 100, 200].filter(n => n <= max).map(n => <button type="button" key={n}
          className="analysis-button" aria-pressed={!all && valid && number === n} onClick={() => choose(n)}>Top {n}</button>)}
      </ChoiceGrid>
      <label className="mag-top-n-settings__number">自定义 Top N
        <input aria-label="自定义 Top N" type="number" min="1" max={max} step="1" required={!all} value={draft}
          aria-invalid={!all && !valid} onChange={event => setDraft(event.target.value)} />
      </label>
      <input className="mag-top-n-settings__slider" aria-label="拖动选择 MAG 数量" type="range" min="1" max={max} step="1"
        value={valid ? number : 1} onChange={event => choose(event.target.value)} />
      <div className="mag-top-n-settings__limits"><span>1</span><span>{max}</span></div>
      {!all && !valid ? <p role="alert">请输入 1–{max} 之间的整数。</p> : null}
    </fieldset>
    <div className="mag-top-n-settings__summary">
      <strong>{all ? `显示全部 ${matchedCount} 个匹配 MAG` : valid ? `显示排名前 ${number} 个 MAG` : '请输入显示数量'}</strong>
      <span>沿用当前排名依据，列表分页和排序独立。</span>
      {(all ? matchedCount : number) > 60 ? <span>可用图内拖动条缩小浏览区间，查看局部标签和数值。</span> : null}
    </div>
    <div className="mag-top-n-settings__footer">
      <button type="button" className="analysis-button" onClick={() => choose(Math.min(20, max))}>推荐数量</button>
      <button type="submit" className="analysis-button mag-top-n-settings__apply" disabled={loading || !matchedCount || (!all && !valid)}>应用</button>
    </div>
  </form>;
}
