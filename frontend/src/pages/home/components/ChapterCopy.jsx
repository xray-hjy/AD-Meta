import { Link } from 'react-router-dom';
import { HOME_COPY } from '../homeContent';

// Active body and faded neighbors share one markup/typography source.
export default function ChapterCopy({ chapter, context = false, children }) {
  return <div className={'chapter-content' + (context ? ' chapter-preview__content' : '')}>
    <div className="chapter-index">{chapter.overline}</div>
    <h3 id={context ? undefined : chapter.id + '-title'}>{chapter.title.map(line => <span className="chapter-title-line" key={line}>{line}</span>)}</h3>
    {children}
    <p className="chapter-copy">{chapter.description}</p>
    <ul aria-label={HOME_COPY.showcase.featuresLabel(chapter.label)}>{chapter.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
    {context ? <span className="chapter-link">{chapter.action} <span aria-hidden="true">{HOME_COPY.symbols.forward}</span></span>
      : <Link className="chapter-link" to={chapter.route}>{chapter.action} <span aria-hidden="true">{HOME_COPY.symbols.forward}</span></Link>}
  </div>;
}
