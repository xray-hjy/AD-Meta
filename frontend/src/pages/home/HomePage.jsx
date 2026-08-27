import { Link } from 'react-router-dom';
import { ANALYSIS_DOMAINS } from '../../app/analysisDomains';
import BrandMark from '../../components/brand/BrandMark';

const pipelineBranches = [
  {
    index: 'A',
    status: '已接入',
    title: 'Reads 水平物种分析',
    steps: ['Kraken2 分类', 'Bracken 丰度校正'],
    result: 'Sample × Species',
  },
  {
    index: 'B',
    status: '已接入',
    title: '群落整体功能分析',
    steps: ['MEGAHIT 组装', '基因预测', '功能注释', 'Reads 定量'],
    result: 'Sample × KO',
  },
  {
    index: 'C',
    status: '规划中',
    title: '基因组解析宏基因组',
    steps: ['Coverage 计算', 'Binning', '质量评价', '去冗余', '分类与功能注释'],
    result: 'Final MAGs · Taxonomy · Sample × MAG · MAG × KO',
  },
];

const foundationSteps = [
  '公共宏基因组测序数据',
  'Raw FASTQ',
  '质量控制与序列过滤',
  '宿主污染去除',
  'Clean Reads',
];

export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <Link className="home-brand brand-link" to="/" aria-label="微脑智库首页">
          <BrandMark size="home" />
          <span className="home-brand__name brand-link__label">微脑智库</span>
        </Link>
        <nav className="home-nav" aria-label="主导航">
          <a href="#platform">分析模块</a>
          <a href="#workflow">数据基础</a>
          <Link className="home-nav__action" to="/analysis/abundance">进入分析</Link>
        </nav>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <img
            className="home-hero__media"
            src="/assets/home-analysis-preview.png"
            alt="AD-Meta 分类层级旭日图分析界面"
          />
          <div className="home-hero__veil" aria-hidden="true" />
          <div className="home-hero__content">
            <p className="home-eyebrow">AD × GUT METAGENOME</p>
            <h1 id="home-title">AD-Meta</h1>
            <p className="home-hero__lead">面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具</p>
            <p className="home-hero__description">
              以宏基因组生物信息分析结果为数据基础，当前支持群落物种组成和 KO 功能层面的分析与可视化，并面向 MAG 的分类、丰度、功能及特殊功能解析进行扩展。
            </p>
            <div className="home-hero__actions">
              <Link className="home-primary-action" to="/analysis/abundance">
                进入群落分析
                <span aria-hidden="true">→</span>
              </Link>
              <a className="home-secondary-action" href="#platform">查看分析结构</a>
            </div>
          </div>
          <div className="home-hero__status" aria-label="平台状态">
            <span><b>2</b> 已接入分析域</span>
            <span><b>AD / NC</b> 对照分组</span>
            <span><b>物种 / KO</b> 分析数据</span>
          </div>
        </section>

        <section className="home-section" id="platform">
          <div className="home-section__heading">
            <p className="home-eyebrow">ANALYSIS DOMAINS</p>
            <h2>围绕脑肠轴研究问题，逐步展开分析</h2>
            <p>从群落组成与功能差异出发，后续延伸到物种-功能关联和 MAG 解析，让不同阶段的分析结果在同一研究脉络中衔接。</p>
          </div>
          <div className="capability-list">
            {ANALYSIS_DOMAINS.map((item, index) => (
              <article className={`capability-item capability-item--${item.status}`} key={item.key}>
                <span className="capability-item__index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <div className="capability-item__title-row">
                    <h3>{item.label}</h3>
                    <span className="capability-item__status">
                      {item.status === 'available' ? '已接入' : '规划中'}
                    </span>
                  </div>
                  <p>{item.description}</p>
                  <ul className="capability-item__modules" aria-label={`${item.label}包含模块`}>
                    {item.modules.map(module => (
                      <li
                        className={module.status === 'planned' ? 'capability-item__module--planned' : ''}
                        key={module.label}
                      >
                        {module.label}{module.status === 'planned' ? ' · 规划中' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-workflow" id="workflow">
          <div className="home-workflow__intro">
            <p className="home-eyebrow">DATA FOUNDATION</p>
            <h2>从原始测序数据到可分析结果</h2>
            <p className="home-workflow__lead">
              原始测序数据经过统一预处理后，分别进入物种组成、群落功能和 MAG 解析流程。当前已接入物种与 KO 分析，MAG 路线按照既定技术流程持续扩展。
            </p>
          </div>
          <ol className="pipeline-foundation" aria-label="共同预处理流程">
            {foundationSteps.map((step, index) => (
              <li className={index === foundationSteps.length - 1 ? 'pipeline-foundation__result' : ''} key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
          <ol className="pipeline-branches">
            {pipelineBranches.map(branch => (
              <li className={`pipeline-branch pipeline-branch--${branch.status === '规划中' ? 'planned' : 'ready'}`} key={branch.index}>
                <div className="pipeline-branch__meta">
                  <span>{branch.index}</span>
                  <small>{branch.status}</small>
                </div>
                <h3>{branch.title}</h3>
                <div className="pipeline-branch__steps" aria-label={`${branch.title}技术流程`}>
                  {branch.steps.map(step => <span key={step}>{step}</span>)}
                </div>
                <strong>{branch.result}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-entry-band">
          <div>
            <p className="home-eyebrow">START EXPLORING</p>
            <h2>从已接入的分析数据进入工作区</h2>
          </div>
          <Link className="home-primary-action" to="/analysis/abundance">
            打开群落分析工作区
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className="home-footer">
        <span>AD-Meta</span>
        <span>AD 脑肠轴宏基因组研发辅助工具</span>
      </footer>
    </div>
  );
}
