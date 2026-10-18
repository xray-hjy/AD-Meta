import { Link } from 'react-router-dom';
import { HOME_COPY } from '../homeContent';

export default function HomeFoundation() {
  return <>
    <section className="evidence" id="home-evidence">
      <div className="evidence-inner" data-section-surface>
        <div><p className="eyebrow">DATA FOUNDATION</p><h2>{HOME_COPY.evidenceTitle[0]}<br />{HOME_COPY.evidenceTitle[1]}</h2><p>{HOME_COPY.evidenceDescription}</p></div>
        <div className="evidence-steps">
          {HOME_COPY.evidenceSteps.map((step, index) => <div className="evidence-step" key={step.join('')}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step[0]}<br />{step[1]}</strong></div>)}
          <p className="evidence-footnote">{HOME_COPY.footnote}</p>
        </div>
      </div>
    </section>
    <section className="final-cta" id="home-start">
      <div><p className="eyebrow">START EXPLORING</p><h2>{HOME_COPY.ctaTitle}</h2><p>{HOME_COPY.ctaDescription}</p></div>
      <Link className="button-primary" to="/analysis/abundance">打开分析工作区 <span aria-hidden="true">→</span></Link>
    </section>
  </>;
}
