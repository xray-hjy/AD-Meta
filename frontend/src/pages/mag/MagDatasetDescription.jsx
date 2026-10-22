import { useId, useState } from 'react';
import { magDownloadUrl } from '../../api/mag';
import { getMagOverviewModel, magCount } from './magProcessingProfiles';
import { MAG_OVERVIEW_COPY as COPY } from './magOverviewContent';
import MagDisclosure, { MagCollapse } from './MagDisclosure';
import MagSourceEvidence from './MagSourceEvidence';
import './mag-overview.css';

function Fact({ label, children }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }

export default function MagDatasetDescription({ provenance, capabilities = {}, cohort = {}, pending = false }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const model = getMagOverviewModel(provenance, capabilities);
  const identity = { ...cohort, ...provenance.cohort };
  const project = [identity.projectAccession, identity.studyAccession].filter(Boolean).join(' · ');
  return <section className="chart-frame dataset-description-card mag-data-card" aria-label={COPY.dataTitle} aria-busy={pending}>
    <header className="chart-frame__header"><button type="button" className="dataset-description-card__toggle" aria-label={COPY.dataTitle}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
      <div><h2 className="chart-frame__title">{COPY.dataTitle}</h2><p className="chart-frame__subtitle">{COPY.dataSubtitle}</p></div>
      <div className="mag-data-card__summary"><span><strong>{magCount(model.total)}</strong> 样本</span><span><strong>{magCount(provenance.magCount)}</strong> MAG</span><span className="dataset-description-card__state">{open ? COPY.collapse : COPY.expand}<span className="mag-data-card__chevron" aria-hidden="true">⌄</span></span></div>
    </button></header>
    <MagCollapse open={open} id={id} label={COPY.dataRegion}>
      <div className="mag-data-card__body">
        <div className="mag-data-card__identity"><strong>{identity.name || provenance.datasetKey || provenance.version}</strong><span>{project}</span></div>
        <dl className="mag-data-card__facts">
          <Fact label={COPY.fields.samples}>{magCount(model.total)}<small>{model.groupLabel}</small></Fact>
          <Fact label={COPY.fields.representatives}>{magCount(provenance.magCount)}<small>完整代表基因组目录</small></Fact>
          <Fact label={COPY.fields.matrix}>{magCount(model.total)} × {magCount(provenance.magCount)}<small>样本 × 代表 MAG</small></Fact>
          <Fact label={COPY.fields.scale}>相对丰度（%）<small>保留 CoverM 原始百分比</small></Fact>
          <Fact label={COPY.fields.current}>{magCount(provenance.sampleCount)} 个样本<small>{pending ? COPY.updating : `AD ${magCount(provenance.groupCounts.AD)} / NC ${magCount(provenance.groupCounts.NC)}`}</small></Fact>
          <Fact label={COPY.fields.revision}><code title={provenance.dataFingerprint}>{provenance.dataFingerprint?.slice(0, 12)}</code><small>{COPY.fields.cohort} · {provenance.datasetKey || provenance.version}</small></Fact>
        </dl>
        <div className="mag-data-card__definitions"><h3>{COPY.definitions}</h3><p>{COPY.catalog}</p><p>{COPY.abundance}</p><p>{COPY.threshold}</p></div>
        <MagDisclosure title={COPY.evidence}>
          <dl className="mag-data-card__audit"><Fact label={COPY.fields.project}>{project || identity.name || provenance.version}</Fact><Fact label={COPY.fields.analysis}>{provenance.analysisVersion}</Fact><Fact label={COPY.fields.revision}><code>{provenance.dataFingerprint}</code></Fact></dl>
          <p className="mag-overview-note">{COPY.research}</p>
          <MagSourceEvidence revision={provenance.dataFingerprint} />
          <a className="mag-overview-link" href={magDownloadUrl('provenance', { ...provenance.filters, revision: provenance.dataFingerprint })} download>{COPY.download} ↓</a>
        </MagDisclosure>
      </div>
    </MagCollapse>
  </section>;
}
