from __future__ import annotations

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
