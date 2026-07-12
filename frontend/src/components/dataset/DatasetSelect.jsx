export default function DatasetSelect({ datasets, value, onChange, disabled }) {
  return (
    <select
      className="dataset-select"
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || datasets.length === 0}
    >
      {datasets.map(dataset => (
        <option key={dataset.slug} value={dataset.slug}>
          {dataset.name}
        </option>
      ))}
    </select>
  );
}
