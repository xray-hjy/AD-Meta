"""Additive MAG API contract; does not change existing dataset projections."""
from typing import Any, Literal

from pydantic import BaseModel


class MagScopeResponse(BaseModel):
    disease: str
    gender: str
    batch: str
    ageMin: float | None
    ageMax: float | None
    abundanceThresholdPercent: float


class MagSource(BaseModel):
    file: str
    sha256: str
    bytes: int


class MagUpstreamGeneration(BaseModel):
    tool: str
    toolVersion: str
    mapper: str
    genomeInputMode: str
    minimumCoveredFraction: float
    outputFormat: str
    bamCaching: str
    methods: list[str]
    basis: str


class MagProvenance(BaseModel):
    version: str
    analysisVersion: str
    dataFingerprint: str
    requestFingerprint: str
    unit: Literal["%"]
    groupField: Literal["disease"]
    filters: MagScopeResponse
    sampleCount: int
    excludedSampleCount: int
    sampleIds: list[str]
    magCount: int
    groupCounts: dict[str, int]
    testedFeatureCount: int
    sources: list[MagSource]
    upstreamGeneration: MagUpstreamGeneration | None
    provenanceScope: Literal["runtime-input-and-downstream-analysis"]
    mappingTolerancePercentPoints: float
    maxMappingErrorPercentPoints: float
    warnings: list[str]


class MagOverviewResponse(BaseModel):
    provenance: MagProvenance
    batches: list[dict[str, str | int]]
    capabilities: dict[str, bool]
    options: dict[str, Any]


class MagFeature(BaseModel):
    magId: str
    lengthBp: int
    meanPercent: float | None
    adMeanPercent: float | None
    ncMeanPercent: float | None
    adMedianPercent: float | None
    ncMedianPercent: float | None
    adAboveThresholdPercent: float | None
    ncAboveThresholdPercent: float | None
    meanDifferencePercentPoints: float | None
    pValue: float | None
    qValue: float | None
    rankBiserial: float | None


class MagFeaturePageResponse(BaseModel):
    provenance: MagProvenance
    items: list[MagFeature]
    total: int
    limit: int
    offset: int
    query: str
    sortBy: str
    direction: str


class MagSample(BaseModel):
    sampleId: str
    disease: Literal["AD", "NC"]
    age: float
    gender: Literal["F", "M"]
    batch: str
    mappedPercent: float
    unmappedPercent: float


class MagThresholdSample(MagSample):
    aboveThresholdMagCount: int


class MagDistributionSample(MagSample):
    abundancePercent: float


class MagBox(BaseModel):
    group: str
    n: int
    values: list[float]


class MagDistributionResponse(BaseModel):
    provenance: MagProvenance
    feature: MagFeature
    samples: list[MagDistributionSample]
    boxes: list[MagBox]


class MagHeatmapResponse(BaseModel):
    provenance: MagProvenance
    magIds: list[str]
    samples: list[MagSample]
    values: list[list[float]]
    selection: str


class MagSamplesResponse(BaseModel):
    provenance: MagProvenance
    items: list[MagThresholdSample]


class MagTaxonomySummaryItem(BaseModel):
    label: str
    count: int
    percent: float


class MagTaxonomyResponse(BaseModel):
    provenance: MagProvenance
    rank: Literal["domain", "phylum", "class", "order", "family", "genus", "species"]
    topN: int
    items: list[MagTaxonomySummaryItem]
    totalMagCount: int
    distinctTaxonCount: int
    resolvedMagCount: int
    unresolvedMagCount: int
    method: str
    version: str | None
    versionNote: str | None


class MagQualityItem(BaseModel):
    magId: str
    completenessPercent: float
    contaminationPercent: float
    completenessModel: str
    codingDensity: float
    contigN50Bp: int
    genomeSizeBp: int
    gcContent: float
    totalCodingSequences: int
    totalContigs: int
    maxContigLengthBp: int
    inReferenceBand: bool


class MagQualitySummary(BaseModel):
    totalMagCount: int
    referenceBandCount: int
    completenessMinPercent: float
    completenessMaxPercent: float
    contaminationMinPercent: float
    contaminationMaxPercent: float


class MagQualityReferenceBand(BaseModel):
    minimumCompletenessPercent: float
    maximumContaminationPercent: float
    label: str


class MagQualityResponse(BaseModel):
    provenance: MagProvenance
    items: list[MagQualityItem]
    summary: MagQualitySummary
    referenceBand: MagQualityReferenceBand
    method: str
    version: str | None


class MagErrorResponse(BaseModel):
    detail: str
    report: dict[str, str] | None = None
