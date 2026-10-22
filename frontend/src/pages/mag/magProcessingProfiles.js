import { MAG_FLOW_STAGES, MAG_OVERVIEW_COPY as COPY } from './magOverviewContent';

// Read processing statistics from the selected source-artifact release.
// No package names, manifest hashes or cohort-specific dimensions are embedded.
export function getMagProcessingProfile(provenance) {
  const processing = provenance?.processing;
  const modules = provenance?.modules;
  if (!processing || !Number.isInteger(processing.assessedBins) || !Number.isInteger(processing.qualifiedBins)
    || processing.qualifiedBins < 0 || processing.qualifiedBins > processing.assessedBins
    || !modules || processing.representativeMags !== provenance.magCount) return null;
  const parameters = modules.lineage?.parameters || {};
  return { ...processing,
    groups: modules.samples?.groupCounts || {},
    completenessMin: parameters.completeness,
    contaminationMax: parameters.contamination,
    qualityToolVersion: modules.quality?.tool?.version || '未记录',
    taxonomyRelease: modules.taxonomy?.tool?.databaseRelease || '未记录',
    primaryAni: parameters.P_ani == null ? null : parameters.P_ani * 100,
    secondaryAni: parameters.S_ani == null ? null : parameters.S_ani * 100,
    clusterMethod: parameters.clusterAlg || '未记录',
    comparisonAlgorithm: parameters.S_algorithm || '未记录',
  };
}

export const magCount = value => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('en-US') : COPY.noNumber;

export function getMagOverviewModel(provenance, capabilities = {}) {
  const profile = getMagProcessingProfile(provenance);
  const total = provenance.processing?.sampleCount ?? (provenance.sampleCount + (provenance.excludedSampleCount || 0));
  const groups = provenance.modules?.samples?.groupCounts || (provenance.excludedSampleCount === 0 ? provenance.groupCounts : null);
  const modules = provenance.modules || {};
  const ready = name => ['ready', 'partial'].includes(modules[name]?.status);
  const groupLabel = groups ? `AD ${magCount(groups.AD)} / NC ${magCount(groups.NC)}` : '以样本来源记录为准';
  const values = { source: magCount(total), binning: profile ? magCount(profile.assessedBins) : null,
    quality: profile ? magCount(profile.qualifiedBins) : null, drep: magCount(provenance.magCount),
    abundance: `${magCount(total)} × ${magCount(provenance.magCount)}` };
  const facts = {
    source: [provenance.cohort?.projectAccession, provenance.cohort?.studyAccession, groupLabel].filter(Boolean),
    clean: ['双端 reads', '处理前后质量报告'], assembly: ['按样本组装', 'Contig 回贴用于分箱输入'],
    binning: profile ? [`质量评估输入 ${magCount(profile.assessedBins)} 个 bins`] : [],
    quality: profile ? [`评估 ${magCount(profile.assessedBins)} 个`, `通过 ${magCount(profile.qualifiedBins)} 个`,
      `排除 ${magCount(profile.assessedBins - profile.qualifiedBins)} 个`,
      profile.completenessMin != null && `完整度 ≥${profile.completenessMin}%`,
      profile.contaminationMax != null && `污染度 ≤${profile.contaminationMax}%`,
      modules.quality?.tool?.version && `CheckM2 ${modules.quality.tool.version}`].filter(Boolean) : [],
    drep: profile ? [`成员 ${magCount(profile.qualifiedBins)} 个`, `代表 ${magCount(profile.representativeMags)} 个`,
      profile.primaryAni != null && `主聚类 ANI ${profile.primaryAni}%`,
      profile.secondaryAni != null && `次级聚类 ANI ${profile.secondaryAni}%`,
      modules.lineage?.parameters?.S_algorithm, modules.lineage?.parameters?.clusterAlg,
      modules.lineage?.inputVerification?.input_quality != null && `输入表核对 ${magCount(modules.lineage.inputVerification.input_quality)} 个`].filter(Boolean) : [],
    abundance: [`丰度矩阵 ${magCount(total)} × ${magCount(provenance.magCount)}`, '相对丰度（%）',
      provenance.upstreamGeneration?.toolVersion && `CoverM ${provenance.upstreamGeneration.toolVersion}`,
      provenance.upstreamGeneration?.mapper,
      provenance.upstreamGeneration?.minimumCoveredFraction != null && `minimum covered fraction ${provenance.upstreamGeneration.minimumCoveredFraction}`].filter(Boolean),
    taxonomy: [modules.taxonomy?.tool?.version && `GTDB-Tk ${modules.taxonomy.tool.version}`, modules.taxonomy?.tool?.databaseRelease].filter(Boolean),
    phylogeny: ['细菌与古菌分别建树', '支持度设置按各自运行记录解释'],
    arg: ready('arg') ? [`HMM 命中 ${magCount(modules.arg.knownHits)}`, `模型候选 p0.75 ${magCount(modules.arg.novel075)}`, `模型候选 p0.95 ${magCount(modules.arg.novel095)}`] : [],
    bgc: ready('bgc') && modules.bgc.regionCount != null ? [`区域 ${magCount(modules.bgc.regionCount)}`] : [],
  };
  return { total, groups, groupLabel, profile, stages: MAG_FLOW_STAGES.map(stage => {
    const capable = stage.target === 'features' || capabilities[stage.capability || stage.target];
    const community = stage.community && provenance.communityResults?.[stage.community];
    return { ...stage, value: values[stage.id], facts: facts[stage.id] || [],
      target: capable ? stage.target : null, community: community?.revision ? community : null,
      caption: stage.id === 'quality' && profile ? `排除 ${magCount(profile.assessedBins - profile.qualifiedBins)} 个` : stage.short };
  }) };
}
