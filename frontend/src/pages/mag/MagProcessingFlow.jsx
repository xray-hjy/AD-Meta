import { useId, useState } from 'react';
import { magDownloadUrl } from '../../api/mag';
import { getMagProcessingProfile } from './magProcessingProfiles';
import './mag-processing-flow.css';

const count = value => value == null ? '待记录' : value.toLocaleString('en-US');

export default function MagProcessingFlow({ provenance, capabilities = {}, onNavigate }) {
  const [selected, setSelected] = useState(null);
  const panelId = useId();
  const headingId = useId();
  const profile = getMagProcessingProfile(provenance);
  const totalSamples = profile?.sampleCount ?? provenance.sampleCount + (provenance.excludedSampleCount || 0);
  const excluded = profile?.qualifiedBins != null ? profile.assessedBins - profile.qualifiedBins : null;
  const steps = [
    { label: '整合后的 bins', value: count(profile?.assessedBins), caption: '质量评估输入',
      title: '分箱优化整合后的输入',
      description: profile ? `共 ${count(profile.assessedBins)} 个 bin 进入质量评估。这是去冗余前的输入数量，包含可能相似的基因组。` : '当前数据版本未绑定已核验的上游 bin 数量，不能从代表 MAG 数量反推。',
      facts: [`样本来源 ${count(totalSamples)} 个`], source: 'CheckM2 原始质量报告 · quality_report.tsv' },
    { label: 'CheckM2 评估', value: '评估', caption: profile ? `CheckM2 ${profile.qualityToolVersion}` : '完整度 / 污染度',
      title: '评估基因组完整度与污染度',
      description: '完整度衡量恢复的基因组信息；污染度评估混入其他基因组信息的程度。质量评估后，再按同一套条件选择输入。',
      facts: profile ? [`工具 CheckM2 ${profile.qualityToolVersion}`, `评估数量 ${count(profile.assessedBins)} 个`] : ['工具版本以当前来源记录为准'],
      source: 'CheckM2 成功运行记录与原始质量报告', target: capabilities.quality ? 'quality' : null, action: '查看 MAG 质量' },
    { label: '通过质量筛选', value: count(profile?.qualifiedBins), caption: profile ? `排除 ${count(excluded)} 个` : '条件以来源记录为准',
      title: '质量筛选：两个条件同时满足',
      description: '筛选合格的基因组进入 dRep。该步骤判断基因组质量，不定义它在各个样本中的检出状态。',
      facts: profile ? [profile.completenessMin == null ? '完整度阈值未记录' : `完整度 ≥${profile.completenessMin}%`, profile.contaminationMax == null ? '污染度阈值未记录' : `污染度 ≤${profile.contaminationMax}%`, `通过 ${count(profile.qualifiedBins)} / ${count(profile.assessedBins)}`] : ['当前记录未提供上游筛选参数'],
      note: profile ? `当前代表 MAG 中，${count(profile.referenceBandCount)} 个满足完整度 ≥90%、污染度 ≤5% 的更严格参考条件；不直接等同于完整 MIMAG 高质量判定。` : null,
      source: 'run_drep_dereplication.sh · CheckM2 质量报告', target: capabilities.quality ? 'quality' : null, action: '查看 MAG 质量' },
    { label: 'dRep 去冗余', value: '聚类', caption: '选择代表基因组',
      title: '相似基因组聚类与代表选择',
      description: profile ? `使用 ${profile.comparisonAlgorithm} 与 ${profile.clusterMethod} 聚类，从 ${count(profile.qualifiedBins)} 个成员中选择 ${count(profile.representativeMags)} 个代表。聚类阈值不等于每个成员与代表的实际 ANI 下限。` : '成员与代表关系、聚类参数以当前数据版本的来源记录为准。',
      facts: profile ? [profile.primaryAni == null ? '主聚类阈值未记录' : `主聚类 ANI ${profile.primaryAni}%`, profile.secondaryAni == null ? '次级聚类阈值未记录' : `次级聚类 ANI ${profile.secondaryAni}%`] : ['聚类参数以来源记录为准'],
      source: 'dRep Cdb / Wdb / Ndb 原表', target: capabilities.lineage ? 'lineage' : null, action: '查看来源与去冗余' },
    { label: '代表 MAG', value: count(provenance.magCount), caption: '当前分析集合',
      title: '当前 MAG 分析的数据基础',
      description: '代表 MAG 是当前分析使用的基因组集合；代表基因组数量不直接等于物种数量。丰度、分类、质量及成员来源按 MAG ID 关联。',
      facts: [`丰度矩阵 ${count(totalSamples)} × ${count(provenance.magCount)}`, ...(profile ? [`AD ${profile.groups.AD} / NC ${profile.groups.NC}`] : []), `数据版本 ${provenance.version}`],
      source: provenance.manifest?.file || '当前 MAG 数据版本及运行时输入记录', target: 'features', action: '查看丰度与候选列表' },
  ];
  const active = selected == null ? null : steps[selected];
  return <section className="mag-processing" aria-labelledby={headingId}>
    <header className="mag-processing__header">
      <h2 id={headingId}>MAG 数据处理流程</h2>
      <span>{provenance.version} · {count(totalSamples)} 个样本</span>
    </header>
    <div className="mag-processing__flow" role="group" aria-label="MAG 上游处理步骤">
      {steps.map((step, index) => <button type="button" key={step.label}
        className="mag-processing__step" aria-expanded={selected === index} aria-controls={panelId}
        onClick={() => setSelected(current => current === index ? null : index)}>
        <span className="mag-processing__node" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="mag-processing__step-content">
          <span className="mag-processing__step-heading">{step.label}</span>
          <strong className={`mag-processing__value${index === 1 || index === 3 ? ' mag-processing__value--word' : ''}`}>{step.value}</strong>
          <span className="mag-processing__caption">{step.caption}</span>
        </span>
      </button>)}
    </div>
    <p className="mag-processing__context"><span>本数据版本的处理结果</span><span>下方样本筛选不改变上游 MAG 集合</span></p>
    <section id={panelId} className="mag-processing__detail" aria-label="流程步骤详情" hidden={!active}>
      {active && <>
        <div className="mag-processing__detail-heading"><h3>{active.title}</h3><button type="button" className="mag-processing__close" aria-label="收起流程步骤详情" onClick={() => setSelected(null)}>×</button></div>
        <div className="mag-processing__facts">{active.facts.map(fact => <span key={fact}>{fact}</span>)}</div>
        {selected === 2 && profile?.qualifiedBins != null && profile.assessedBins > 0 && <div className="mag-processing__quality-bar" role="img" aria-label={`通过 ${count(profile.qualifiedBins)} 个，排除 ${count(excluded)} 个`}><span style={{ width: `${profile.qualifiedBins / profile.assessedBins * 100}%` }} /></div>}
        <p>{active.description}</p>
        {active.note && <p>{active.note}</p>}
        <div className="mag-processing__detail-footer"><span>{active.source}</span>{active.target && onNavigate && <button className="mag-processing__link" type="button" onClick={() => onNavigate(active.target)}>{active.action} <span aria-hidden="true">→</span></button>}</div>
      </>}
    </section>
    <details className="mag-processing__methods">
      <summary>方法与来源</summary>
      <p>仅供探索性研究。候选特征不等于已验证生物标志物，不支持临床诊断或因果判断。组间检验未做协变量校正。</p>
      <p>超过丰度阈值的比例不等同于生物学检出率。完整度 ≥90%、污染度 ≤5% 的参考条件不能单独代替完整 MIMAG 高质量判定。</p>
      {profile ? <p>来源：CheckM2 质量报告、dRep 原表与 CoverM 结果；处理数量从本次导入记录生成。CheckM2 {profile.qualityToolVersion} · GTDB {profile.taxonomyRelease}。</p> : <p>上游处理数量与参数以本数据版本的正式来源记录为准；当前模块尚无完整的导入统计。</p>}
      {provenance.manifest?.file && <p>版本来源：<code>{provenance.manifest.file}</code></p>}
      <a className="mag-processing__link" href={magDownloadUrl('provenance', { revision: provenance.dataFingerprint })} download>下载数据版本溯源 JSON</a>
    </details>
  </section>;
}
