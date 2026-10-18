import { Link } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';

export default function HomeHeader({ onChapter, onSection }) {
  return <header className="site-header">
      <Link className="brand" to="/" aria-label="微脑智库首页"><BrandMark size="home" /><span>微脑智库</span></Link>
      <nav className="header-nav" aria-label="首页导航">
        <a href="#home-showcase" onClick={event => { event.preventDefault(); onChapter('species'); }}>可视化展示</a>
        <a href="#home-evidence" onClick={event => { event.preventDefault(); onSection('foundation'); }}>数据基础</a>
        <a href="#home-customization" onClick={event => { event.preventDefault(); onChapter('custom'); }}>自定义能力</a>
        <Link className="header-reference" to="/reference/gmrepo">外部证据评估</Link>
        <Link className="header-cta" to="/analysis/abundance">进入分析 ↗</Link>
      </nav>
    </header>;
}
