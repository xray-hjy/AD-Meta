function cssLength(value, fallback) {
  if (value == null) return fallback;
  return typeof value === 'number' ? `${value}px` : value;
}

export default function ChartViewport({
  children,
  variant = 'fit',
  minHeight = 480,
  preferredHeight,
  maxHeight = 760,
  maxWidth,
  className = '',
}) {
  const classes = [
    'chart-viewport',
    `chart-viewport--${variant}`,
    className,
  ].filter(Boolean).join(' ');
  const style = {
    '--chart-viewport-min-height': cssLength(minHeight, '480px'),
    '--chart-viewport-preferred-height': cssLength(preferredHeight ?? minHeight, '480px'),
    '--chart-viewport-max-height': cssLength(maxHeight, '760px'),
    '--chart-viewport-max-width': cssLength(maxWidth, '100%'),
  };

  return (
    <div className={classes} style={style}>
      <div className="chart-viewport__canvas">
        {children}
      </div>
    </div>
  );
}
