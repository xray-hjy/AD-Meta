import './result-section.css';

/** Native disclosure behavior with the same full-width header as MAG results. */
export default function ResultDisclosure({ title, summary, className = '', children, open, onToggle }) {
  return <details className={`result-section result-section--disclosure ${className}`.trim()} aria-label={title} open={open} onToggle={onToggle}>
    <summary className="result-section__bar">
      <svg className="result-section__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
      <span className="result-section__title">{title}</span>
      {summary ? <span className="result-section__summary">{summary}</span> : null}
    </summary>
    <div className="result-section__body">{children}</div>
  </details>;
}
