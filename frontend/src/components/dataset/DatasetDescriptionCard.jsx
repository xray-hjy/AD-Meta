import { useId, useState } from 'react';

export default function DatasetDescriptionCard({ open, onOpenChange, subtitle = '当前数据版本、样本来源与丰度口径', children }) {
  const id = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  const toggle = () => {
    if (onOpenChange) onOpenChange(!expanded);
    else setLocalOpen(!expanded);
  };
  return <section className="chart-frame dataset-description-card" aria-label="数据说明卡片">
    <header className="chart-frame__header">
      <button type="button" className="dataset-description-card__toggle" aria-label="数据说明"
        aria-expanded={expanded} aria-controls={id} onClick={toggle}>
        <div>
          <h2 className="chart-frame__title">数据说明</h2>
          <p className="chart-frame__subtitle">{subtitle}</p>
        </div>
        <span className="dataset-description-card__state">{expanded ? '收起' : '展开'}
          <svg viewBox="0 0 16 16" aria-hidden="true" className={expanded ? 'is-open' : ''}><path d="m6 3 5 5-5 5" /></svg>
        </span>
      </button>
    </header>
    <div id={id} className="dataset-description-card__body" hidden={!expanded}>{expanded ? children : null}</div>
  </section>;
}
