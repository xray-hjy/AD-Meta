import StyledSelect from '../ui/StyledSelect';
import { getSelectableRuns } from './analysisRunSelection';
export default function AnalysisRunSelect({ runs, value, onChange, disabled }) {
  const selectable = getSelectableRuns(runs);
  const linkedRun = runs.find(run => run.key === value && run.selectorVisible === false);
  return (
    <StyledSelect
      className="dataset-select"
      aria-label="选择分析运行"
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || selectable.length === 0}
    >
      {linkedRun && <option value={linkedRun.key} hidden disabled>{linkedRun.name}</option>}
      {selectable.map(run => (
        <option key={run.key} value={run.key}>
          {run.name}
        </option>
      ))}
    </StyledSelect>
  );
}
