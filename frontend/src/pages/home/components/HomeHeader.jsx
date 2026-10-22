import { Link } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';
import { HOME_COPY } from '../homeContent';

export default function HomeHeader({ onChapter, onSection }) {
  return <header className="site-header">
      <Link className="brand" to="/" aria-label={HOME_COPY.brand.homeLabel}><BrandMark size="home" /><span>{HOME_COPY.brand.name}</span></Link>
      <nav className="header-nav" aria-label={HOME_COPY.header.navigationLabel}>
        <a href="#home-showcase" onClick={event => { event.preventDefault(); onChapter('species'); }}>{HOME_COPY.header.showcase}</a>
        <a href="#home-evidence" onClick={event => { event.preventDefault(); onSection('foundation'); }}>{HOME_COPY.header.foundation}</a>
        <a href="#home-customization" onClick={event => { event.preventDefault(); onChapter('custom'); }}>{HOME_COPY.header.customization}</a>
        <Link className="header-reference" to="/reference/gmrepo">{HOME_COPY.header.reference}</Link>
        <Link className="header-cta" to="/analysis/abundance">{HOME_COPY.header.analysis} <span aria-hidden="true">{HOME_COPY.symbols.external}</span></Link>
      </nav>
    </header>;
}
