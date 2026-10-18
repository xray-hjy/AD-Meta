import { useContext, useState } from 'react';
import { EvidenceContext } from './EvidenceLink';
import EvidenceLink from './EvidenceLink';

export default function ChartEvidencePicker({ items }) {
  const context = useContext(EvidenceContext);
  const key = `admeta:evidence:chart-object:${context?.sourceRevision}:${context?.sourceChart}`;
  const read = () => { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } };
  const [state, setState] = useState(() => ({ key, id: read() }));
  const id = state.key === key ? state.id : read();
  if (context?.featureKind !== 'taxonomy' || !context.sourceRevision) return null;
  const validId = items.some(item => String(item.featureId) === id) ? id : '';
  return <div className="chart-control-strip" aria-label="图中物种外部证据">
    <label>评估图中物种 <select value={validId} onChange={e => {
      setState({ key, id: e.target.value });
      try { sessionStorage.setItem(key, e.target.value); } catch { /* Selection works without storage. */ }
    }}>
      <option value="">明确选择一个研究对象</option>{items.map(item => <option key={item.featureId} value={String(item.featureId)}>{item.shortName || item.fullName || item.featureId}</option>)}
    </select></label>
    {validId ? <EvidenceLink subjectId={validId} /> : null}
  </div>;
}
