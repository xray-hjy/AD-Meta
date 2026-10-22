import { useId, useRef, useState } from 'react';
import { getMagOverviewModel } from './magProcessingProfiles';
import { MAG_OVERVIEW_COPY as COPY } from './magOverviewContent';
import MagDisclosure, { MagCollapse } from './MagDisclosure';
import MagFlowGraph from './MagFlowGraph';
import MagSourceEvidence from './MagSourceEvidence';
import './mag-overview.css';
import './mag-processing-flow.css';

function StepDetail({ stage, stages, onSelect, onClose, onNavigate, onCommunityNavigate, revision }) {
  const related = stages.filter(s => stage.next.includes(s.id) || s.next.includes(stage.id));
  return <div className="mag-processing__detail-content" key={stage.id}>
    <div className="mag-processing__detail-heading"><div><span className="mag-processing__eyebrow">{stage.tools.join(' · ')}</span><h3>{stage.label}</h3></div><button type="button" className="mag-processing__close" aria-label={COPY.closeDetail} onClick={onClose}>×</button></div>
    <dl className="mag-processing__explanation">{[[COPY.input, stage.input], [COPY.method, stage.method], [COPY.output, stage.output]].map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
    {stage.facts.length > 0 && <div className="mag-processing__facts" aria-label={COPY.parameters}>{stage.facts.map(fact => <span key={fact}>{fact}</span>)}</div>}
    {stage.id === 'quality' && <p className="mag-overview-note">完整度 ≥90%、污染度 ≤5% 可作为更严格的参考条件，不能单独代替完整 MIMAG 高质量判定。</p>}
    <div className="mag-processing__detail-footer">
      <div className="mag-processing__related" aria-label={COPY.related}>{related.map(item => <button type="button" key={item.id} onClick={() => onSelect(item.id)}>{item.label} <span aria-hidden="true">↗</span></button>)}</div>
      {stage.target && onNavigate && <button className="mag-overview-link" type="button" onClick={() => onNavigate(stage.target)}>{stage.action || COPY.navigate} →</button>}
      {stage.community && onCommunityNavigate && <button className="mag-overview-link" type="button" onClick={() => onCommunityNavigate(stage.community)}>{stage.action} →</button>}
    </div>
    {(stage.modules.length > 0 || stage.scripts.length > 0) && <MagDisclosure title={COPY.sourcesLabel}>
      <MagSourceEvidence revision={revision} modules={stage.modules} scripts={stage.scripts} />
    </MagDisclosure>}
  </div>;
}

export default function MagProcessingFlow({ provenance, capabilities = {}, onNavigate, onCommunityNavigate }) {
  const [selected, setSelected] = useState(null);
  const [lastSelected, setLastSelected] = useState(null);
  const section = useRef(null);
  const panelId = useId();
  const headingId = useId();
  const { stages, total } = getMagOverviewModel(provenance, capabilities);
  const active = stages.find(stage => stage.id === (selected || lastSelected));
  const select = id => { setLastSelected(id); setSelected(current => current === id ? null : id); };
  const closeDetail = () => {
    const id = selected;
    setSelected(null);
    section.current?.querySelector(`button[data-flow-node="${id}"]`)?.focus();
  };
  return <section ref={section} className="mag-processing" aria-labelledby={headingId}>
    <header className="mag-processing__header">
      <div><h2 id={headingId}>{COPY.flowTitle}</h2><p>{COPY.flowHint}</p></div>
      <span className="mag-processing__cohort">{provenance.cohort?.projectAccession || provenance.version} · {total} 个样本</span>
    </header>
    <MagFlowGraph stages={stages} selected={selected} onSelect={select} detailId={panelId} />
    <div className="mag-processing__context"><span>{COPY.stable}</span><span>{COPY.scrollHint}</span></div>
    <MagCollapse open={Boolean(selected)} id={panelId} label={COPY.detail} className="mag-processing__detail">
      {active && <StepDetail stage={active} stages={stages} revision={provenance.dataFingerprint}
        onSelect={id => { setLastSelected(id); setSelected(id); }} onClose={closeDetail}
        onNavigate={onNavigate} onCommunityNavigate={onCommunityNavigate} />}
    </MagCollapse>
  </section>;
}
