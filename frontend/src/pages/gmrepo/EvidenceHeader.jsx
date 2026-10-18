import { Link, useParams, useSearchParams } from 'react-router-dom';
import { safeAnalysisReturn } from '../../components/evidence/EvidenceLink';
import { referenceHref, referenceParams, subjectHref } from './referenceNavigation';
import BrandMark from '../../components/brand/BrandMark';
import { useColorVision } from '../../context/ColorVisionContext';
import './gmrepo.css';
import './evaluation.css';

export default function EvidenceHeader({ detail = false, returnTo }) {
  const [params] = useSearchParams();
  const { genusId } = useParams();
  const context = genusId && !params.has('subjectId') ? referenceParams(params, { subjectType: 'genus', subjectId: genusId }) : params;
  const hasSubject = !!(context.get('subjectId') || context.get('analysisGenus'));
  const { colorBlindFriendly, setColorBlindFriendly } = useColorVision();
  return <header className="gmrepo-header evaluation-header app-topbar">
    <Link className="gmrepo-brand brand-link workspace-brand-link" to="/" aria-label="微脑智库首页"><BrandMark /><strong className="app-title">AD-Meta</strong></Link>
    <span className="evaluation-header-context">外部证据评估</span>
    <nav aria-label="外部证据导航">
      <Link className="topbar-home-link" to={referenceHref(context)} aria-current={!detail ? 'page' : undefined}>参考资源</Link>
      <Link className="topbar-home-link" to={subjectHref(context)} aria-current={detail ? 'page' : undefined}>{hasSubject ? '对象评估' : '菌属检索'}</Link>
      <Link className="topbar-home-link" to={`/reference/gmrepo/comparison?${new URLSearchParams([...context].filter(([key]) => ['revision', 'sourceRevision', 'datasetSlug', 'returnTo'].includes(key)))}`}>多候选对照</Link>
      <Link className="topbar-home-link" to={safeAnalysisReturn(returnTo || params.get('returnTo'))}>返回主分析</Link>
    </nav>
    <label className={`colorblind-toggle gmrepo-color-control${colorBlindFriendly ? ' colorblind-toggle--active' : ''}`}><input type="checkbox" checked={colorBlindFriendly} onChange={e => setColorBlindFriendly(e.target.checked)} />
      <span className="colorblind-toggle__track" aria-hidden="true"><span className="colorblind-toggle__thumb" /></span><span>色盲友好</span></label>
  </header>;
}
