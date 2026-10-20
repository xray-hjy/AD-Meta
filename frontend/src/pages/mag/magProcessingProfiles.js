// Read processing statistics from the selected source-artifact release.
// No package names, manifest hashes or cohort-specific dimensions are embedded.
export function getMagProcessingProfile(provenance) {
  const processing = provenance?.processing;
  const modules = provenance?.modules;
  if (!processing || processing.assessedBins == null || !modules || processing.representativeMags !== provenance.magCount) return null;
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
