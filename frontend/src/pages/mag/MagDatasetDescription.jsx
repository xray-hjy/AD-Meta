import DatasetDescriptionCard from '../../components/dataset/DatasetDescriptionCard';
import { magDownloadUrl } from '../../api/mag';
import { getMagProcessingProfile } from './magProcessingProfiles';

const count = value => value == null ? '未提供' : Number(value).toLocaleString('en-US');
function Fact({ label, children }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }

export default function MagDatasetDescription({ provenance, capabilities = {} }) {
  const profile = getMagProcessingProfile(provenance);
  const totalSamples = profile?.sampleCount ?? provenance.sampleCount + (provenance.excludedSampleCount || 0);
  const groups = profile?.groups || (provenance.excludedSampleCount === 0 ? provenance.groupCounts : null);
  const upstream = provenance.upstreamGeneration;
  return <DatasetDescriptionCard subtitle="代表基因组目录、丰度尺度与数据版本来源">
    <section className="dataset-description" aria-label="MAG 数据集信息">
      <div className="dataset-description__heading"><div>
        <span className="dataset-description__eyebrow">已接入 MAG 数据包</span>
        <h3>MAG 数据集信息</h3>
        <p className="dataset-description__name">{provenance.version} · 目录数量不受下方样本筛选影响</p>
      </div></div>
      <dl className="dataset-description__facts">
        <Fact label="数据类型">宏基因组组装基因组（MAG）</Fact>
        <Fact label="丰度数据结构">样本 × 代表 MAG</Fact>
        <Fact label="全量样本数">{count(totalSamples)}</Fact>
        <Fact label="代表 MAG 数">{count(provenance.magCount)}</Fact>
        <Fact label="全量分组构成">{groups ? `AD ${count(groups.AD)} · NC ${count(groups.NC)}` : '未提供全量分组记录'}</Fact>
        <Fact label="丰度尺度">相对丰度（%），保留原始百分比</Fact>
        <Fact label="当前筛选范围">{count(provenance.sampleCount)} 个样本 · AD {count(provenance.groupCounts.AD)} / NC {count(provenance.groupCounts.NC)}</Fact>
        <Fact label="分类 / 质量证据">{capabilities.taxonomy ? '已接入 GTDB 分类' : '分类待接入'} · {capabilities.quality ? '已接入质量表' : '质量待接入'}</Fact>
      </dl>
      <section className="dataset-description__source" aria-label="MAG 数据来源与口径">
        <h4>数据来源与口径</h4>
        <dl>
          <Fact label="基因组目录">代表 MAG 经质量筛选及去冗余获得；代表数量不直接等于物种数量。丰度、分类、质量与成员来源按稳定 MAG ID 关联。</Fact>
          <Fact label="丰度阈值">仅用于统计丰度严格大于阈值的样本比例和 MAG 数量，不等同于生物学检出界限，不改变原始丰度。</Fact>
          {upstream ? <Fact label="丰度生成记录">{upstream.tool} {upstream.toolVersion} · {upstream.mapper} · minimum covered fraction {upstream.minimumCoveredFraction}</Fact> : null}
          {profile ? <Fact label="已核验流程版本">CheckM2 {profile.qualityToolVersion} · GTDB {profile.taxonomyRelease} · 质量筛选后 {count(profile.qualifiedBins)} 个成员 → {count(profile.representativeMags)} 个代表</Fact> : null}
        </dl>
      </section>
      <details className="dataset-description__version"><summary>数据版本与输入来源</summary>
        <dl>
          <Fact label="数据版本">{provenance.version}</Fact>
          <Fact label="分析版本">{provenance.analysisVersion}</Fact>
          {provenance.manifest?.file ? <Fact label="数据清单">{provenance.manifest.file}</Fact> : null}
          <Fact label="数据指纹">{provenance.dataFingerprint}</Fact>
          {(provenance.sources || []).map(source => <Fact key={source.file} label="输入文件">{source.file}<br />SHA-256: {source.sha256}</Fact>)}
        </dl>
        <a className="analysis-button" href={magDownloadUrl('provenance', { revision: provenance.dataFingerprint })} download>下载数据版本溯源 JSON</a>
      </details>
    </section>
  </DatasetDescriptionCard>;
}
