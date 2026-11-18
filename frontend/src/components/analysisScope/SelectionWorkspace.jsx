import { useId, useState } from 'react';
import './selection-workspace.css';

// Keep controls mounted when folded so searches, subset drafts and pool edits survive.
export default function SelectionWorkspace({ controls, summary, children }) {
  const panelId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(360);

  return <div className="selection-workspace-container">
    <div className={`selection-workspace${collapsed ? ' is-collapsed' : ''}`} style={{ '--selection-width': `${width}px` }}>
      <aside className="selection-workspace__panel" aria-label="研究对象工作区">
        <header className="selection-workspace__heading">
          <div><h2>研究对象</h2><div className="selection-workspace__summary" aria-live="polite">{summary}</div></div>
          <button type="button" className="analysis-button" aria-expanded={!collapsed} aria-controls={panelId}
            onClick={() => setCollapsed(current => !current)}>{collapsed ? '展开对象池' : '收起对象池'}</button>
        </header>
        <div id={panelId} hidden={collapsed}>
          <label className="selection-workspace__width">对象区宽度
            <input aria-label="对象区宽度" type="range" min="320" max="480" step="20" value={width}
              onChange={event => setWidth(Number(event.target.value))} />
            <output>{width}px</output>
          </label>
          {controls}
        </div>
      </aside>
      <div className="selection-workspace__chart">{children}</div>
    </div>
  </div>;
}
