export default function ChartExportAction({ onClick, disabled = false, label = '导出图形' }) {
  return (
    <button
      type="button"
      className="chart-export-action"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 19h16" />
      </svg>
    </button>
  );
}
