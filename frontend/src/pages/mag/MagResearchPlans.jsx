export const MAG_RESEARCH_PLANS = [
  { key: 'function', title: 'MAG 功能潜力', question: '哪些候选 MAG 携带与研究问题相关的功能？', available: '代表 MAG 标识、分类、质量、丰度矩阵', missing: '按稳定 MAG ID 关联的 KO / CAZyme / ARG / BGC 注释、工具与数据库版本', output: '功能检索、基因与通路证据、MAG × 功能矩阵；描述编码潜力，不推断表达活性', priority: '优先补充' },
  { key: 'detection', title: '定量与检出证据', question: '低丰度信号是否有足够的比对支持？', available: '样本映射比例、MAG 相对丰度及上游工具记录', missing: '样本 × MAG 的 reads 支持、覆盖广度、平均深度及比对参数', output: '丰度与覆盖证据联查、阈值敏感性曲线；明确缺失、零值和检出判据', priority: '优先补充' },
  { key: 'robustness', title: '批次与协变量稳健性', question: '组间候选关联能否在控制批次、年龄、性别后保持？', available: 'AD / NC、HPC_Batch、年龄、性别及丰度', missing: '预先定义的统计方案、协变量校正结果、批次内分析及敏感性分析', output: '原始与校正效应比较、批次一致性和不确定性；样本筛选不替代校正', priority: '优先分析' },
  { key: 'phylogeny', title: '系统发育关系', question: '候选 MAG 的谱系位置和近缘关系是什么？', available: 'GTDB 层级分类与参考标识', missing: '标记基因比对、带支持度的树文件、建树模型与参考版本', output: '树与分类、质量、功能的联动注释；分类层级不冒充系统发育树', priority: '后续完善' },
  { key: 'validation', title: '独立队列验证', question: '候选关联能否在独立队列中复现？', available: '当前队列候选与来源追溯', missing: '独立队列、统一定量流程、预先固定的候选和评价方案', output: '独立验证效应、方向与不确定性；CHN / CHN2 来源组不视为已完成验证', priority: '后续研究' },
];
export function MagPlanCard({ plan }) {
  return <article className="mag-plan-card"><header><span className="mag-plan-status">已规划，待完成</span><span>{plan.priority}</span></header><h3>{plan.title}</h3><p>{plan.question}</p>
    <dl><dt>已有基础</dt><dd>{plan.available}</dd><dt>待补输入 / 分析</dt><dd>{plan.missing}</dd><dt>预期呈现</dt><dd>{plan.output}</dd></dl></article>;
}
export default function MagResearchPlans({ capabilities = {} }) {
  const plans = MAG_RESEARCH_PLANS.filter(plan => !({ function: capabilities.metabolism, detection: capabilities.coverage, phylogeny: capabilities.phylogeny }[plan.key]));
  return <section className="mag-research-plans" aria-label="MAG 研究拓展"><header><span className="mag-kicker">研究拓展</span><h2>后续证据补充</h2><p>以下板块为待完成的研究模板；结果接入后再展示真实图表与方法记录。</p></header>
    <div className="mag-plan-grid">{plans.map(plan => <MagPlanCard key={plan.key} plan={plan} />)}</div></section>;
}
