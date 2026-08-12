from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProvenanceResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    revision: str | None = None
    sourceSha256: str | None = None
    sourceFileSize: int | None = None
    abundanceScale: str = "unknown"
    normalization: str = "unknown"
    missingValuePolicy: str = "error"
    covariates: list[str] = Field(default_factory=list)
    groupMapping: dict[str, str] = Field(default_factory=dict)
    computeVersion: str | None = None
    parametersHash: str | None = None
    generatedAt: Any | None = None


class DatasetResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: str = ""
    sampleCount: int = 0
    speciesCount: int = 0
    featureCount: int = 0
    featureKind: str = "taxonomy"
    featureLabel: str = "物种"
    groupCounts: dict[str, int] = Field(default_factory=dict)
    publishedAt: Any | None = None
    currentRevision: str | None = None
    analysisStatus: str = "exploratory_only"
    provenance: ProvenanceResponse = Field(default_factory=ProvenanceResponse)
    availableArtifacts: list[str] | None = None
    availableCharts: list[str] | None = Field(default=None, deprecated=True)


class SummaryResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    datasetSlug: str
    datasetName: str
    totalSamples: int
    totalSpecies: int = 0
    totalFeatures: int = 0
    featureKind: str = "taxonomy"
    featureLabel: str = "物种"
    groupCounts: dict[str, int] = Field(default_factory=dict)
    currentRevision: str | None = None
    analysisStatus: str = "exploratory_only"
    availableArtifacts: list[str] = Field(default_factory=list)
    provenance: ProvenanceResponse = Field(default_factory=ProvenanceResponse)


class DifferentialStatistic(BaseModel):
    model_config = ConfigDict(extra="allow")

    featureId: str | None = None
    pValue: float | None = None
    qValue: float | None = None
    effectSize: float | None = None
    effectMetric: str | None = None


class ChartArtifactResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    method: str | None = None
    inferenceLevel: str | None = None
    modelFormula: str | None = None
    items: list[dict[str, Any]] | None = None
    stats: list[dict[str, Any]] | None = None


ChartArtifactPayload = ChartArtifactResponse | list[dict[str, Any]]


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
    requestId: str | None = None


class AnalysisArtifactResponse(BaseModel):
    key: str
    type: str
    datasetSlug: str | None = None
    datasetRevision: str | None = None
    featureKind: str | None = None
    featureLabel: str | None = None
    abundanceScale: str = "unknown"
    normalization: str = "unknown"
    sampleCount: int
    groupCounts: dict[str, int] = Field(default_factory=dict)
    coverageFraction: float
    schemaVersion: str
    uri: str


class AnalysisRunResponse(BaseModel):
    id: int
    key: str
    name: str
    description: str = ""
    status: str
    manifestVersion: str
    sampleCount: int
    groupCounts: dict[str, int] = Field(default_factory=dict)
    pipeline: dict[str, Any] = Field(default_factory=dict)
    parameters: dict[str, Any] = Field(default_factory=dict)
    referenceDatabases: list[dict[str, Any]] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[AnalysisArtifactResponse] = Field(default_factory=list)
    createdAt: datetime | None = None
    completedAt: datetime | None = None
    publishedAt: datetime | None = None


class AnalysisSampleResponse(BaseModel):
    sampleCode: str
    phenotype: str
    cohortKey: str = ""
    sourceStudy: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalysisSamplePageResponse(BaseModel):
    runKey: str
    artifactKey: str | None = None
    items: list[AnalysisSampleResponse] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    groupCounts: dict[str, int] = Field(default_factory=dict)
    availableFields: list[str] = Field(default_factory=list)


class AnalysisSampleDetailResponse(AnalysisSampleResponse):
    runKey: str
    artifacts: list[dict[str, Any]] = Field(default_factory=list)


class AnalysisFeatureResponse(BaseModel):
    featureId: str
    fullName: str
    shortName: str
    rank: int
    meanAbundance: float
    detectedSampleCount: int
    prevalence: float


class AnalysisFeaturePageResponse(BaseModel):
    runKey: str
    artifactKey: str
    featureKind: str
    featureLabel: str
    items: list[AnalysisFeatureResponse] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    query: str = ""
    sourceFeatureCount: int


class AbundanceProjectionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    projectionKey: str
    runKey: str
    artifactKey: str
    datasetSlug: str
    datasetRevision: str
    featureKind: str
    featureLabel: str
    scope: dict[str, Any]
    series: list[dict[str, Any]] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)
    projection: dict[str, Any]


class ChartProjectionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    projectionKey: str
    runKey: str
    artifactKey: str
    datasetSlug: str
    datasetRevision: str
    featureKind: str
    featureLabel: str
    scope: dict[str, Any]
    payload: Any
    projection: dict[str, Any]


class ProjectionAuditResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    projectionKey: str
    kind: str
    section: str
    summary: dict[str, Any] = Field(default_factory=dict)
    sampleScope: dict[str, Any] = Field(default_factory=dict)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[dict[str, Any]] = Field(default_factory=list)
    filterOptions: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0
    limit: int = 100
    offset: int = 0


class ProjectionAuditMetadataResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    projectionKey: str
    kind: str
    section: str
    summary: dict[str, Any] = Field(default_factory=dict)
    sampleScope: dict[str, Any] = Field(default_factory=dict)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[dict[str, Any]] = Field(default_factory=list)
    artifact: dict[str, Any] = Field(default_factory=dict)


class ProjectionAuditOptionsResponse(BaseModel):
    projectionKey: str
    section: str
    field: str
    items: list[dict[str, Any]] = Field(default_factory=list)
    limit: int = 200
    offset: int = 0
    total: int = 0
    hasMore: bool = False
    query: str = ""
    mode: str = "search_results"
    initialOrder: str = "search_results"
    sourceFeatureCount: int | None = None


class ProjectionAuditRowsResponse(BaseModel):
    projectionKey: str
    kind: str
    section: str
    columns: list[dict[str, Any]] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0
    limit: int = 100
    offset: int = 0
