export default function MagFunctionPlan() {
  return <article className="mag-plan-card"><header><span className="mag-plan-status">已规划，待完成</span><span>优先补充</span></header>
    <h3>MAG 功能潜力</h3><p>哪些候选 MAG 携带与研究问题相关的功能？</p>
    <dl>
      <dt>已有基础</dt><dd>代表 MAG 标识、分类、质量、丰度矩阵</dd>
      <dt>待补输入 / 分析</dt><dd>按稳定 MAG ID 关联的 KO / CAZyme / ARG / BGC 注释、工具与数据库版本</dd>
      <dt>预期呈现</dt><dd>功能检索、基因与通路证据、MAG × 功能矩阵及编码潜力</dd>
    </dl>
  </article>;
}
