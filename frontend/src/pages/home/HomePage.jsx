import { Link } from 'react-router-dom';

const analysisCapabilities = [
  {
    index: '01',
    title: '物种丰度',
    description: '比较 AD 与 NC 队列的菌群组成、差异特征和分类层级。',
  },
  {
    index: '02',
    title: 'KO 功能丰度',
    description: '观察功能组成、检出率与组间富集方向。',
  },
  {
    index: '03',
    title: '多样性与排序',
    description: '通过 PCA、PCoA 等视图探索样本整体结构。',
  },
];

export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <Link className="home-brand" to="/" aria-label="AD-Meta 首页">
          <span className="home-brand__mark" aria-hidden="true">AD</span>
          <span>AD-Meta</span>
        </Link>
        <nav className="home-nav" aria-label="主导航">
          <a href="#platform">平台概览</a>
          <a href="#workflow">研究流程</a>
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
            <p className="home-hero__lead">阿尔茨海默病与肠道菌群宏基因组可视化分析平台</p>
            <p className="home-hero__description">
              基于公共队列的物种与 KO 丰度结果，在统一工作区中完成组成、差异与多样性探索。
            </p>
            <div className="home-hero__actions">
              <Link className="home-primary-action" to="/analysis/abundance">
                进入丰度分析
                <span aria-hidden="true">→</span>
              </Link>
              <a className="home-secondary-action" href="#platform">了解当前能力</a>
            </div>
          </div>
          <div className="home-hero__status" aria-label="平台状态">
            <span><b>373</b> 样本</span>
            <span><b>2</b> 队列</span>
            <span><b>物种 / KO</b> 当前分析域</span>
          </div>
        </section>

        <section className="home-section" id="platform">
          <div className="home-section__heading">
            <p className="home-eyebrow">AVAILABLE ANALYSIS</p>
            <h2>一个工作区，两类丰度数据</h2>
            <p>物种与 KO 共享数据集、分组和交互骨架，并按数据能力呈现对应图表。</p>
          </div>
          <div className="capability-list">
            {analysisCapabilities.map(item => (
              <article className="capability-item" key={item.index}>
                <span className="capability-item__index">{item.index}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-workflow" id="workflow">
          <div>
            <p className="home-eyebrow">DATA FOUNDATION</p>
            <h2>分析流程与平台解耦，结果在这里汇合</h2>
          </div>
          <ol className="workflow-steps">
            <li><span>01</span><b>公共测序数据</b><small>AD 与健康对照队列</small></li>
            <li><span>02</span><b>质控与组装</b><small>外部生物信息流程</small></li>
            <li><span>03</span><b>丰度结果</b><small>物种表与 KO 表</small></li>
            <li><span>04</span><b>预计算展示</b><small>后端产出，前端交互</small></li>
          </ol>
        </section>

        <section className="home-entry-band">
          <div>
            <p className="home-eyebrow">START EXPLORING</p>
            <h2>从真实数据进入分析</h2>
          </div>
          <Link className="home-primary-action" to="/analysis/abundance">
            打开分析工作区
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className="home-footer">
        <span>AD-Meta</span>
        <span>宏基因组可视化分析平台</span>
      </footer>
    </div>
  );
}
