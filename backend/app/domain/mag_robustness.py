"""Contract for the precomputed, release-pinned MAG association results."""

from typing import Any, Literal

from pydantic import BaseModel, Field, FiniteFloat, model_validator

Covariate = Literal['age', 'gender', 'batch']
ANALYSIS_VERSION = 'mag-log2-ols-hc3-v1'
FDR_ALPHA = 0.05


class SampleCounts(BaseModel):
    sampleCount: int = Field(ge=0)
    adCount: int = Field(ge=0)
    ncCount: int = Field(ge=0)

    @model_validator(mode='after')
    def check_counts(self):
        if self.sampleCount != self.adCount + self.ncCount:
            raise ValueError('AD and NC counts must sum to the fitted sample count')
        return self


class Estimate(BaseModel):
    status: Literal['estimated', 'unavailable']
    reason: str | None = None
    beta: FiniteFloat | None = None
    ciLow: FiniteFloat | None = None
    ciHigh: FiniteFloat | None = None
    standardError: FiniteFloat | None = Field(default=None, gt=0)
    pValue: FiniteFloat | None = Field(default=None, ge=0, le=1)
    qValue: FiniteFloat | None = Field(default=None, ge=0, le=1)
    geometricMeanRatio: FiniteFloat | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def check_estimate(self):
        if self.status == 'estimated':
            if any(value is None for value in (self.beta, self.ciLow, self.ciHigh, self.standardError, self.pValue)):
                raise ValueError('Estimated effects require a beta, interval, SE and p')
            if not self.ciLow <= self.beta <= self.ciHigh or self.reason:
                raise ValueError('Invalid estimated effect')
        elif not self.reason or any(value is not None for value in (
            self.beta, self.ciLow, self.ciHigh, self.standardError, self.pValue, self.qValue, self.geometricMeanRatio,
        )):
            raise ValueError('Unavailable effects require a reason and empty statistics')
        return self


class Association(SampleCounts):
    magId: str
    unadjusted: Estimate
    adjusted: Estimate
    minAbundancePercent: FiniteFloat | None = None
    nonPositiveCount: int = Field(ge=0)
    nonFiniteCount: int = Field(ge=0)
    outOfRangeCount: int = Field(ge=0)
    maxCooksDistance: FiniteFloat | None = None
    influentialSampleCount: int | None = None
    maxSingleSampleBetaChange: FiniteFloat | None = None
    mostInfluentialSampleId: str | None = None


class BatchOmission(SampleCounts):
    magId: str
    excludedBatch: str
    estimate: Estimate
    betaChange: FiniteFloat | None = None
    directionReversed: bool | None = None
    intervalWidthRatio: FiniteFloat | None = None


class RobustnessSummary(SampleCounts):
    datasetKey: str
    projectAccession: str
    release: str
    analysisVersion: str
    cohortSampleCount: int
    magCount: int
    testedUnadjusted: int
    testedAdjusted: int
    belowFdrUnadjusted: int
    belowFdrAdjusted: int
    fdrAlpha: float
    covariates: list[Covariate]
    covariateNotes: list[str]
    batchSourceColumn: str | None
    batchDefinition: str | None
    omittedBatches: list[str]
    observationUnitNote: str
    statsmodelsVersion: str


class RobustnessManifest(BaseModel):
    summary: RobustnessSummary
    qualityControl: dict[str, Any]
    methods: dict[str, str]
    files: dict[str, str]


class AdjustedCandidate(BaseModel):
    magId: str
    status: Literal['estimated', 'unavailable']
    reason: str | None
    beta: FiniteFloat | None
    qValue: FiniteFloat | None


class RobustnessResponse(BaseModel):
    status: Literal['ready', 'unavailable']
    release: str
    reason: str | None = None
    summary: RobustnessSummary | None = None
    items: list[AdjustedCandidate] = Field(default_factory=list)
    association: Association | None = None
    sensitivity: list[BatchOmission] = Field(default_factory=list)
