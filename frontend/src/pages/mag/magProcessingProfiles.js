// Historical upstream results verified against the 2026-10-01 server handoff.
// Bind them to the immutable package manifest, not the current sample scope.
const PROFILES = {
  aa55cf86a44642b8602aafeb33e6c06c4c85fd1d7678a3b8dd3891728bc6c5f6: {
    version: 'mag_v3',
    assessedBins: 9133,
    qualifiedBins: 8548,
    representativeMags: 872,
    sampleCount: 185,
    groups: { AD: 122, NC: 63 },
    completenessMin: 50,
    contaminationMax: 10,
    qualityToolVersion: '1.1.0',
    primaryAni: 90,
    secondaryAni: 95,
    referenceBandCount: 666,
    taxonomyRelease: 'R232',
  },
};

export function getMagProcessingProfile(provenance) {
  const profile = PROFILES[provenance?.manifest?.sha256?.toLowerCase()];
  return profile && profile.version === provenance?.version
    && profile.representativeMags === provenance?.magCount ? profile : null;
}
