export default function DataTableViewport({
  ariaLabel,
  children,
  className = '',
  footer = null,
  maxHeight,
}) {
  const classes = ['data-table-viewport', className].filter(Boolean).join(' ');
  const style = maxHeight
    ? { '--data-table-viewport-max-height': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
    : undefined;

  return (
    <div
      className={classes}
      role="region"
      tabIndex={0}
      aria-label={ariaLabel}
      style={style}
    >
      <table className="data-table">{children}</table>
      {footer ? <div className="data-table-viewport__footer">{footer}</div> : null}
    </div>
  );
}
