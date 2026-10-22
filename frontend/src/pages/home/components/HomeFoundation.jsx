import { Fragment, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HOME_CHAPTERS, HOME_COPY } from '../homeContent';

const chapterFor = key => HOME_CHAPTERS.find(chapter => chapter.key === key);

function Chevron({ className }) {
  return <svg className={className} width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function AnalysisBranches({ copy }) {
  const [expanded, setExpanded] = useState(null);
  const triggers = useRef([]);
  return <div className="foundation-analysis" onKeyDown={event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    triggers.current[copy.branches.findIndex(branch => branch.key === expanded)]?.focus();
    setExpanded(null);
  }}>
    <p className="foundation-branch-hint">{copy.branchHint}</p>
    <div className="foundation-branches" role="group" aria-label={copy.branchesLabel}>
      {copy.branches.map((branch, index) => <Fragment key={branch.key}><button type="button"
        className="foundation-branch" style={{ '--branch-accent': chapterFor(branch.key).accent }}
        ref={element => { triggers.current[index] = element; }}
        id={'foundation-branch-' + branch.key} aria-label={copy.toggleLabel(branch.label)}
        aria-expanded={expanded === branch.key} aria-controls={'foundation-methods-' + branch.key}
        onClick={() => setExpanded(current => current === branch.key ? null : branch.key)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? copy.branches.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + copy.branches.length) % copy.branches.length;
          triggers.current[next]?.focus();
        }}>
        <span className="foundation-branch__eyebrow"><span>{branch.label}</span><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></span>
        <strong className="foundation-branch__title">{branch.title}</strong>
        <span className="foundation-branch__summary">{branch.summary}</span>
        <span className="foundation-branch__result">{branch.result}</span>
        <span className="foundation-branch__inspect">{expanded === branch.key ? copy.collapseInspect : copy.inspect}<Chevron /></span>
      </button>
      <div id={'foundation-methods-' + branch.key}
        className={'foundation-detail' + (expanded === branch.key ? ' is-open' : '')}
        style={{ '--branch-accent': chapterFor(branch.key).accent }}
        aria-hidden={expanded !== branch.key} inert={expanded !== branch.key}>
        <div className="foundation-detail__clip">
          <section className="foundation-detail__body" aria-label={copy.detailLabel(branch.label)}>
            <div className="foundation-detail__heading"><h3>{copy.detailLabel(branch.label)}</h3>
              <Link to={chapterFor(branch.key).route}>{copy.sourceLink}<span aria-hidden="true">{HOME_COPY.symbols.forward}</span></Link>
            </div>
            <dl className="foundation-detail__context">
              <div><dt>{copy.detailFields.input}</dt><dd>{branch.input}</dd></div>
              <div><dt>{copy.detailFields.output}</dt><dd>{branch.output}</dd></div>
            </dl>
            <h4 className="foundation-detail__label">{copy.detailFields.steps}</h4>
            <ol className="foundation-methods">
              {branch.steps.map((step, index) => <li key={step.title}>
                <span className="foundation-methods__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div><div className="foundation-methods__heading"><strong>{step.title}</strong>
                  <span className="foundation-tools">{step.tools.map(tool => <span key={tool}>{tool}</span>)}</span></div>
                  <p>{step.description}</p>
                </div>
              </li>)}
            </ol>
            <p className="foundation-method-note">{copy.methodNote}</p>
          </section>
        </div>
      </div></Fragment>)}
    </div>
  </div>;
}

export default function HomeFoundation() {
  const { foundation: copy, cta } = HOME_COPY;
  return <>
    <section className="evidence" id="home-evidence" aria-labelledby="home-evidence-title">
      <div className="evidence-inner" data-section-surface>
        <div className="foundation-intro">
          <div><p className="eyebrow">{copy.eyebrow}</p><h2 id="home-evidence-title">{copy.title[0]}<br />{copy.title[1]}</h2></div>
          <div className="foundation-intro__copy"><p>{copy.description}</p>
            <div className="foundation-cohort"><span>{copy.cohortLabel}</span><strong>{copy.cohort}</strong><span>{copy.groupSummary}</span></div>
          </div>
        </div>
        <div className="foundation-scale">
          <dl className="foundation-metrics" aria-label={copy.metricsLabel}>
            {copy.metrics.map(metric => <div key={metric.key} style={{ '--branch-accent': chapterFor(metric.domain).accent }}>
              <dt>{metric.label}</dt><dd>{metric.value}</dd><dd className="foundation-metrics__note">{metric.note}</dd>
            </div>)}
          </dl>
          <div className="foundation-scope"><span>{copy.scopeNote}</span><span>{copy.snapshotLabel(copy.snapshot.checkedAt)}</span></div>
        </div>
        <ol className="foundation-pipeline" aria-label={copy.pipelineLabel}>
          {copy.pipeline.map((step, index) => <li key={step.title}>
            <span className="foundation-pipeline__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{step.title}</strong><span>{step.description}</span></div>
            {index < copy.pipeline.length - 1 && <Chevron className="foundation-pipeline__arrow" />}
          </li>)}
        </ol>
        <AnalysisBranches copy={copy} />
        <aside className="foundation-reference" aria-label={copy.reference.label}>
          <div><h3>{copy.reference.label}</h3><p>{copy.reference.description}</p></div>
          <Link to={copy.reference.route}>{copy.reference.action}<span aria-hidden="true">{HOME_COPY.symbols.forward}</span></Link>
        </aside>
      </div>
    </section>
    <section className="final-cta" id="home-start" aria-labelledby="home-start-title">
      <div><p className="eyebrow">{cta.eyebrow}</p><h2 id="home-start-title">{cta.title}</h2><p>{cta.description}</p></div>
      <nav className="foundation-actions" aria-label={cta.navigationLabel}>
        {cta.actions.map(action => <Link key={action.key} className="button-primary" style={{ '--branch-accent': chapterFor(action.key).accent }}
          to={chapterFor(action.key).route}>{action.label}<span aria-hidden="true">{HOME_COPY.symbols.forward}</span></Link>)}
      </nav>
    </section>
  </>;
}
