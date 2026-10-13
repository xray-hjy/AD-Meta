from typing import Literal

from pydantic import BaseModel

ReferenceScope = Literal["all", "complete", "plot_ready", "group_confirmed", "stage_reference", "pending", "no_profile"]
ReferenceGroup = Literal["", "AD", "NC", "MCI", "at_risk", "cognitively_normal_amyloid_status_unresolved", "unresolved", "other"]


class ReferenceSource(BaseModel):
    label: str
    url: str


class ReferenceProvenance(BaseModel):
    version: str
    inputSnapshot: str
    fingerprint: str
    processedAt: str
    metadataTotal: int
    profileTotal: int
    genusTotal: int
    sources: list[ReferenceSource]
    observationUnit: str
    purpose: str


class ReferenceSelection(BaseModel):
    cohort: str
    group: str
    scope: ReferenceScope


class ReferenceCohort(BaseModel):
    projectId: str
    metadataRuns: int
    completeProfiles: int
    groupConfirmedRuns: int
    plotReadyRuns: int
    adRuns: int
    ncRuns: int
    stageReferenceRuns: int
    pendingRuns: int
    noProfileRuns: int
    noResolvedGenusRuns: int
    unresolvedMedianPercent: float | None
    originalStudyUrl: str | None


class ReferenceOption(BaseModel):
    value: str
    label: str


class GmrepoCatalogResponse(BaseModel):
    provenance: ReferenceProvenance
    cohorts: list[ReferenceCohort]
    groups: list[ReferenceOption]
    scopes: list[ReferenceOption]


class ReferenceCounts(BaseModel):
    selectedRuns: int
    completeProfiles: int
    groupConfirmedRuns: int
    plotReadyRuns: int
    adRuns: int
    ncRuns: int
    stageReferenceRuns: int
    pendingRuns: int
    noProfileRuns: int
    noResolvedGenusRuns: int


class ReferenceDecision(BaseModel):
    key: str
    label: str
    count: int


class ReferenceMissingness(BaseModel):
    field: str
    label: str
    denominator: int
    knownCount: int
    unavailableCount: int
    unavailablePercent: float | None
    intervalCount: int
    unmappedCodeCount: int


class ReferenceResolution(BaseModel):
    projectId: str
    profileCount: int
    medianUnresolvedPercent: float
    noResolvedGenusCount: int


class GmrepoOverviewResponse(BaseModel):
    provenance: ReferenceProvenance
    selection: ReferenceSelection
    counts: ReferenceCounts
    cohorts: list[ReferenceCohort]
    decisions: list[ReferenceDecision]
    missingness: list[ReferenceMissingness]
    resolution: list[ReferenceResolution]


class ReferenceGenus(BaseModel):
    featureId: str
    name: str
    domain: str
    sourceTaxonIds: list[str]
    sourceNames: list[str]


class GmrepoGeneraResponse(BaseModel):
    provenance: ReferenceProvenance
    total: int
    items: list[ReferenceGenus]


class ReferenceSample(BaseModel):
    projectId: str
    runId: str
    specimenId: str | None
    biosampleAccession: str | None
    researchGroup: str
    sourceGroup: str | None
    decisionKey: str
    decisionLabel: str
    reason: str
    groupReviewStatus: str
    profileStatus: str
    ageYears: float | None
    ageRaw: str | None
    sex: str
    sourceSexCode: str | None
    bmi: float | None
    unresolvedPercent: float | None
    resolvedGenusPercent: float | None
    identityStatus: str
    identityNote: str
    originalStudyUrl: str | None
    evidenceFiles: list[str]
    genusAbundancePercent: float | None


class GmrepoSamplesResponse(BaseModel):
    provenance: ReferenceProvenance
    selection: ReferenceSelection
    genus: ReferenceGenus | None
    total: int
    limit: int
    offset: int
    items: list[ReferenceSample]


class GmrepoErrorResponse(BaseModel):
    detail: str
    code: str


class ReferenceMethods(BaseModel):
    version: str
    unadjusted: str
    adjusted: str
    fdr: str
    limits: list[str]
    sources: list[ReferenceSource]


class ReferenceCovariates(BaseModel):
    group: str
    count: int
    ageKnown: int
    ageMedian: float | None
    ageIntervalCount: int
    sexKnown: int
    sexCategories: dict[str, int]
    adjustedCount: int


class ReferenceDesign(BaseModel):
    columns: list[str]
    rank: int | None
    conditionNumber: float | None
    maxLeverage: float | None
    residualDf: int | None


class ReferenceAudit(BaseModel):
    projectId: str
    metadataRuns: int
    plotReadyRuns: int
    groupConfirmedRuns: int
    excludedNoGenusRuns: int
    groupCounts: dict[str, int]
    knownParticipantRuns: int
    uniqueKnownParticipants: int
    repeatedParticipantIds: int
    identityStatus: str
    reviewVersion: str | None
    reviewFingerprint: str
    reviewNote: str
    evidenceFiles: list[str]
    sourceUrl: str | None
    sexMode: str
    covariates: list[ReferenceCovariates]
    design: ReferenceDesign
    unadjustedStatus: str
    unadjustedReasons: list[str]
    adjustedStatus: str
    adjustedReasons: list[str]
    adjustedCount: int
    excludedMissingCovariates: int


class GmrepoAuditResponse(BaseModel):
    provenance: ReferenceProvenance
    methods: ReferenceMethods
    items: list[ReferenceAudit]


class ReferencePoint(BaseModel):
    runId: str
    participantId: str | None
    specimenId: str | None
    group: str
    value: float
    jitter: float
    unresolvedPercent: float
    ageYears: float | None
    ageRaw: str | None
    sex: str
    sourceSexCode: str | None
    readCount: int | None
    qcStatus: str
    identityStatus: str


class ReferenceBox(BaseModel):
    group: str
    count: int
    detectedCount: int
    box: list[float] | None
    logBox: list[float] | None


class GmrepoDistributionResponse(BaseModel):
    provenance: ReferenceProvenance
    cohort: str
    genus: ReferenceGenus
    audit: ReferenceAudit
    unit: str
    boxes: list[ReferenceBox]
    points: list[ReferencePoint]
    note: str


class ReferenceAdjustedStatistic(BaseModel):
    status: str
    effect: float | None
    ciLow: float | None
    ciHigh: float | None
    pValue: float | None
    qValue: float | None
    residualDf: int


class ReferenceStatistic(BaseModel):
    genus: ReferenceGenus
    adCount: int
    ncCount: int
    adMedianPercent: float
    ncMedianPercent: float
    adDetectedPercent: float
    ncDetectedPercent: float
    rankBiserial: float
    direction: str
    pValue: float
    qValue: float
    adjusted: ReferenceAdjustedStatistic | None
    signalStatus: str


class ReferenceStatisticsSummary(BaseModel):
    unadjustedFdrCount: int
    adjustedFdrCount: int
    concordantFdrCount: int


class GmrepoStatisticsResponse(BaseModel):
    provenance: ReferenceProvenance
    audit: ReferenceAudit
    methods: ReferenceMethods
    familySize: int
    total: int
    limit: int
    offset: int
    items: list[ReferenceStatistic]
    summary: ReferenceStatisticsSummary


class ReferenceMarker(BaseModel):
    sourceTaxonId: str
    sourceName: str
    lda: float
    direction: str
    comparisonStatus: str
    sourceFile: str
    pureAdNc: bool
    pValue: None
    qValue: None


class ReferencePrimarySpecies(BaseModel):
    featureId: str
    name: str
    sourceGenus: str


class ReferencePrimaryEvidence(BaseModel):
    status: str
    datasetSlug: str
    datasetRevision: str | None
    sourceSha256: str | None
    abundanceScale: str | None
    normalization: str | None
    sampleCount: int | None
    groupCounts: dict[str, int]
    cohortId: str | None
    platform: str
    matchMethod: str
    matchedFeatureCount: int
    speciesPreview: list[ReferencePrimarySpecies]
    quantitativeStatus: str
    reasons: list[str]
    comparisonNote: str


class GmrepoEvidenceResponse(BaseModel):
    provenance: ReferenceProvenance
    cohort: str
    genus: ReferenceGenus
    audit: ReferenceAudit
    statistic: ReferenceStatistic | None
    rankBiserialCi: list[float] | None
    ciMethod: str
    sourceMarkers: list[ReferenceMarker]
    sourceNote: str
    primary: ReferencePrimaryEvidence
