import { useState } from 'react';
import ChoiceGrid from '../../components/ui/ChoiceGrid';
import { ToolbarPopover } from './MagToolbar';

function CountPanel({ value, max, noun, onChange, close }) {
  const [draft, setDraft] = useState(String(Math.min(value, max)));
  const count = Number(draft), valid = draft.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= max;
  const confirm = () => { if (valid) { onChange(count); close(); } };
  return <div className="mag-top-n-settings">
    <p className="mag-top-n-settings__context">当前集合最多 {max.toLocaleString()} {noun === 'MAG' ? '个 MAG' : '项功能'}</p>
    <ChoiceGrid className="mag-top-n-settings__presets" aria-label="常用数量">
      {[3, 10, 20, 30, 40, 100, 200, 500].filter(n => n <= max).map(n => <button type="button" className="analysis-button" key={n} aria-pressed={count === n} onClick={() => setDraft(String(n))}>{n}</button>)}
    </ChoiceGrid>
    <label className="mag-top-n-settings__number">自定义数量<input aria-label={`展示${noun}数量`} type="number" min="1" max={max} step="1" value={draft} aria-invalid={!valid}
      onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirm(); } }} /></label>
    <input className="mag-top-n-settings__slider" aria-label={`${noun}数量滑条`} type="range" min="1" max={max} value={valid ? count : 1} onChange={e => setDraft(e.target.value)} />
    {!valid && <p role="alert">请输入 1–{max} 之间的整数。</p>}
    <p className="mag-muted">确认数量后，点击“应用设置”更新结果；已有筛选和固定清单保持不变。</p>
    <div className="mag-top-n-settings__footer"><button type="button" className="analysis-button" aria-pressed={count === max} onClick={() => setDraft(String(max))}>全部匹配</button>
      <button type="button" className="analysis-button analysis-button--primary" disabled={!valid} onClick={confirm}>确认数量</button></div>
  </div>;
}

export default function MagCountControl({ value, max, noun = 'MAG', onChange }) {
  const maximum = Math.max(1, Math.min(1000, max));
  return <div className="mag-inline-field">{noun}<ToolbarPopover label={`${value} ${noun === 'MAG' ? '个' : '项'} ⌄`} title={`展示${noun}数量`} ariaLabel={`展示${noun}数量`} className="mag-top-n-popover" fitViewport>
    {close => <CountPanel value={value} max={maximum} noun={noun} onChange={onChange} close={close} />}
  </ToolbarPopover></div>;
}
