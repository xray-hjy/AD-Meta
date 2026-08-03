export default function AnalysisRunSelect({ runs, value, onChange, disabled }) {
  return (
    <select
      className="dataset-select"
      aria-label="选择分析运行"
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || runs.length === 0}
    >
      {runs.map(run => (
        <option key={run.key} value={run.key}>
          {run.name}
        </option>
      ))}
    </select>
  );
}
