export default function DatasetSelect({
  datasets,
  value,
  onChange,
  disabled,
  getOptionLabel = dataset => dataset.name,
  ariaLabel = '选择分析数据',
}) {
  return (
    <select
      className="dataset-select"
      aria-label={ariaLabel}
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || datasets.length === 0}
    >
      {datasets.map(dataset => (
        <option key={dataset.slug} value={dataset.slug}>
          {getOptionLabel(dataset)}
        </option>
      ))}
    </select>
  );
}
