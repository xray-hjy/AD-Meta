import { Link } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';

export default function HomeHeader({ onReplay, onChapter }) {
  return <>
    <div className="status-strip"><strong>物种丰度 · KO 功能 · MAG 热图</strong>，打开工作区即可查看。
      <button type="button" className="replay-intro" onClick={onReplay}>重播开场 ↻</button>
    </div>
    <header className="site-header">
      <Link className="brand" to="/" aria-label="微脑智库首页"><BrandMark size="home" /><span>微脑智库</span></Link>
      <nav className="header-nav" aria-label="首页导航">
        <a href="#home-showcase" onClick={event => { event.preventDefault(); onChapter('species'); }}>可视化展示</a>
        <a href="#home-evidence">数据基础</a>
        <a href="#home-customization" onClick={event => { event.preventDefault(); onChapter('custom'); }}>自定义能力</a>
        <Link className="header-reference" to="/reference/gmrepo">GMrepo 参考</Link>
        <Link className="header-cta" to="/analysis/abundance">进入分析 ↗</Link>
      </nav>
    </header>
  </>;
}
