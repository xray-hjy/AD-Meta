import StyledSelect from '../../components/ui/StyledSelect';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChartFrameActionGroup from '../../components/Charts/ChartFrameActionGroup';
import MagImageExportSettings from './MagImageExportSettings';
import MagTopNSettings from './MagTopNSettings';
import MagHeatmapCountSettings from './MagHeatmapCountSettings';
import { MAG_COLUMNS, MAG_COLUMN_PRESETS } from './MagFeatureTable';
import './mag-toolbar.css';

function ToolbarPopover({ label, title, children, disabled = false, exportButton = false, className = '', ariaLabel, fitViewport = false }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [placement, setPlacement] = useState(null);
  const close = useCallback(() => { setOpen(false); document.getElementById(`${id}-trigger`)?.focus(); }, [id]);
  useLayoutEffect(() => {
    if (!open || !fitViewport) return undefined;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger || !rootRef.current || !panelRef.current) return;
      const width = Math.min(320, window.innerWidth - 32);
      const maxHeight = Math.max(120, window.innerHeight - 80);
      const height = Math.min(panelRef.current.scrollHeight + 2, maxHeight);
      const below = trigger.bottom + 8;
      const above = trigger.top - 8 - height;
      const top = below + height <= window.innerHeight - 16 ? below : above >= 64 ? above
        : Math.max(64, window.innerHeight - height - 16);
      const left = Math.max(16, Math.min(trigger.left, window.innerWidth - width - 16));
      // The body portal escapes chart-card clipping; copy the workspace theme
      // because CSS inheritance no longer follows the trigger's ancestors.
      const computed = getComputedStyle(rootRef.current);
      const theme = Object.fromEntries(['--workspace-accent', '--workspace-accent-soft', '--color-border',
        '--color-bg-panel', '--color-text-main', '--color-text-muted'].map(key => [key, computed.getPropertyValue(key)]));
      const next = { position: 'fixed', top, left, right: 'auto', bottom: 'auto', width, maxHeight, ...theme };
      setPlacement(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    place();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    observer?.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, fitViewport]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    panelRef.current?.querySelector('input, select, button')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const panel = open ? <div ref={panelRef} id={id}
    className={`mag-toolbar-popover__panel${fitViewport ? ' mag-toolbar-popover__panel--viewport' : ''}`}
    role="dialog" aria-label={title} style={fitViewport ? placement : undefined}>
    <div className="mag-toolbar-popover__heading"><strong>{title}</strong><button type="button" className="analysis-button" aria-label={`关闭${title}`} onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button></div>
    {children(close)}
  </div> : null;
  return <div className={`mag-toolbar-popover${exportButton ? ' mag-toolbar-popover--export' : ''} ${className}`.trim()} ref={rootRef}>
    <button ref={triggerRef} id={`${id}-trigger`} type="button" className={`analysis-button${exportButton ? ' mag-export-trigger' : ''}`} aria-label={ariaLabel} disabled={disabled} aria-expanded={open} aria-controls={open ? id : undefined}
      aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      {exportButton ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 18v3h16v-3" /></svg> : null}
      {label}{exportButton ? <span className="mag-export-trigger__chevron" aria-hidden="true">⌄</span> : null}
    </button>
    {fitViewport && panel ? createPortal(panel, document.body) : panel}
  </div>;
}

export function MagHeatmapCountControl(props) {
  return <div className="mag-heatmap-count-control"><span>显示 MAG 数</span>
    <ToolbarPopover label={<>{Number(props.value) === 0 ? '全部匹配' : `${props.value} 个`}<span aria-hidden="true">⌄</span></>}
      title="热图 MAG 显示数量" ariaLabel="显示 MAG 数" className="mag-top-n-popover mag-heatmap-count-popover" fitViewport>
      {close => <MagHeatmapCountSettings {...props} close={close} />}
    </ToolbarPopover>
  </div>;
}

export function MagColumnSettings({ value, onChange }) {
  const toggle = key => onChange(value.includes(key) ? value.filter(item => item !== key) : [...value, key]);
  return <ToolbarPopover label="列设置" title="列表列设置">{() => <>
    <div className="mag-column-presets" aria-label="列显示预设">{Object.entries(MAG_COLUMN_PRESETS).map(([label, keys]) => <button key={label} type="button"
      className="analysis-button" aria-pressed={keys.length === value.length && keys.every(key => value.includes(key))} onClick={() => onChange(keys)}>{label}</button>)}</div>
    <div className="mag-column-options">{MAG_COLUMNS.map(column => <label key={column.key}><input type="checkbox" checked={value.includes(column.key)} disabled={column.key === 'magId'}
      onChange={() => toggle(column.key)} />{[column.label, column.hint].filter(Boolean).join(' ')}</label>)}</div>
    <p>MAG ID 始终显示并固定在左侧；完整下载保留全部列。</p>
  </>}</ToolbarPopover>;
}

export function MagChartExportMenu({ actions, format, size, onFormatChange, onSizeChange, note, pngLabel = 'PNG（2×）', ariaLabel = 'MAG 丰度对比操作' }) {
  const exportAction = actions.find(action => action.id === 'export');
  return <>
    <ChartFrameActionGroup actions={actions.filter(action => action.id !== 'export')} ariaLabel={ariaLabel} />
    <ToolbarPopover label="导出图像" title="图像导出设置" exportButton disabled={!exportAction || exportAction.disabled}>{close => exportAction?.supportsCustomSize
      ? <MagImageExportSettings action={exportAction} close={close} /> : <>
      <label className="mag-export-field">图像格式<StyledSelect value={format} onChange={event => onFormatChange(event.target.value)}><option value="svg">SVG 矢量</option><option value="png">{pngLabel}</option></StyledSelect></label>
      <label className="mag-export-field">导出尺寸<StyledSelect value={size} onChange={event => onSizeChange(event.target.value)}><option value="standard">标准 ≥1100×640</option><option value="large">大图 ≥1800×1000</option></StyledSelect></label>
      {note && <p className="mag-muted">{note}</p>}
      <button type="button" className="analysis-button mag-export-submit" onClick={() => { exportAction?.onClick(); close(); }}>下载 {format.toUpperCase()} 图像</button>
    </>}</ToolbarPopover>
  </>;
}

export function MagCandidateBrowser({ sortBy, direction, onSortChange, onDirectionChange, pagination, total, page, loading, error, onRetry, downloads }) {
  return <ToolbarPopover label="候选浏览" title="MAG 候选浏览">{() => <>
    <MagListSort sortBy={sortBy} direction={direction} onSortChange={onSortChange} onDirectionChange={onDirectionChange} />
    <p role="status">{loading ? '正在读取候选 MAG…' : `共 ${total ?? 0} 个 MAG · 第 ${page} 页`}</p>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="analysis-button" onClick={onRetry}>重试候选查询</button></div> : null}
    <div className="mag-candidate-pagination">{pagination}</div>
    <div className="mag-candidate-downloads">{downloads}</div>
  </>}</ToolbarPopover>;
}

export function MagListSort({ sortBy, direction, onSortChange, onDirectionChange }) {
  return <div className="mag-inline-controls">
    <label>排序<StyledSelect aria-label="列表排序" value={sortBy} onChange={onSortChange}>
      <option value="meanPercent">平均丰度</option><option value="qValue">BH-FDR q</option><option value="meanDifferencePercentPoints">AD−NC 均值差</option><option value="rankBiserial">秩效应量</option><option value="magId">MAG ID</option>
    </StyledSelect></label>
    <button type="button" className="analysis-button mag-sort-direction" aria-label={`列表方向：${direction === 'asc' ? '升序' : '降序'}，点击切换`} title={`当前${direction === 'asc' ? '升序' : '降序'}，点击切换`}
      onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}><span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span></button>
  </div>;
}

export function MagChartControls({ topN, chartSortBy, onTopNChange, onRankChange, matchedCount = 0, loading = false }) {
  return <div className="mag-inline-controls" aria-label="MAG 图表选取设置">
    <label>排名<StyledSelect aria-label="图表排名依据" value={chartSortBy} onChange={event => onRankChange(event.target.value)}><option value="meanPercent">全部所选样本平均丰度</option><option value="adMeanPercent">AD 组平均丰度</option><option value="ncMeanPercent">NC 组平均丰度</option></StyledSelect></label>
    <div className="mag-inline-field"><span>显示</span>
      <ToolbarPopover label={<>{topN === 0 ? '全部 MAG' : `Top ${topN}`}<span aria-hidden="true">⌄</span></>}
        ariaLabel="图表显示 MAG 数" title="MAG 显示数量" className="mag-top-n-popover" disabled={!matchedCount && !loading}>
        {close => <MagTopNSettings value={topN} matchedCount={matchedCount} loading={loading} onApply={onTopNChange} close={close} />}
      </ToolbarPopover>
    </div>
  </div>;
}
