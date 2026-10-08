import ChartExportMenu from './ChartExportMenu';

const ICON_PATHS = {
  table: (
    <>
      <path d="M5 3.5h10l4 4V20.5H5z" />
      <path d="M15 3.5v4h4M8 11h8M8 14h8M8 17h6" />
    </>
  ),
  line: <path d="M4 18l4.5-6 3.5 3 4.5-8L20 11" />,
  bar: (
    <>
      <path d="M5 19V11h3v8zM10.5 19V6h3v13zM16 19V3h3v16z" />
      <path d="M3 21h18" />
    </>
  ),
  restore: (
    <>
      <path d="M4 8V3.5M4 3.5h4.5" />
      <path d="M5.5 6.5A8 8 0 1 1 4 13" />
    </>
  ),
  expand: <path d="M9 4H4v5m0-5 6 6m5-6h5v5m0-5-6 6M4 15v5h5m-5 0 6-6m10 1v5h-5m5 0-6-6" />,
  export: (
    <>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 19h16" />
    </>
  ),
};

export default function ChartFrameActionGroup({ actions = [], ariaLabel = '图表操作' }) {
  if (!actions.length) return null;

  return (
    <div className="chart-frame-actions" role="toolbar" aria-label={ariaLabel}>
      {actions.map(action => action.id === 'export' && action.supportsCustomSize
        ? <ChartExportMenu key={action.id} action={action} /> : (
        <button
          key={action.id}
          type="button"
          className={`chart-frame-actions__button${action.alternateIcon ? ' chart-frame-actions__button--type' : ''}`}
          data-alternate-active={action.alternateIcon ? Boolean(action.alternateActive) : undefined}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          aria-pressed={action.pressed == null ? undefined : action.pressed}
          title={action.label}
        >
          {action.alternateIcon ? <span className="chart-type-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="chart-type-icon__bar">{ICON_PATHS[action.icon]}</svg>
            <svg viewBox="0 0 24 24" className="chart-type-icon__line">{ICON_PATHS[action.alternateIcon]}</svg>
          </span> : <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {ICON_PATHS[action.icon] || ICON_PATHS.export}
          </svg>}
          {action.text ? <span>{action.text}</span> : null}
        </button>
      ))}
    </div>
  );
}

