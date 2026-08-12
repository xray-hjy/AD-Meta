from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

ScopeMode = Literal["cohort", "group", "subset", "sample"]
GroupCode = Literal["AD", "NC"]


class AnalysisScope(BaseModel):
    """The exact sample population used to build one analytical projection."""

    mode: ScopeMode = "cohort"
    groups: list[GroupCode] = Field(default_factory=list)
    sampleCodes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_selection(self):
        self.groups = list(dict.fromkeys(self.groups))
        self.sampleCodes = list(
            dict.fromkeys(code.strip() for code in self.sampleCodes if code.strip())
        )

        if self.mode == "cohort":
            if self.groups or self.sampleCodes:
                raise ValueError("cohort scope cannot specify groups or sampleCodes")
        elif self.mode == "group":
            if len(self.groups) != 1 or self.sampleCodes:
                raise ValueError("group scope requires exactly one group and no sampleCodes")
        elif self.mode == "subset":
            if len(self.sampleCodes) < 2 or self.groups:
                raise ValueError("subset scope requires at least two sampleCodes and no groups")
        elif self.mode == "sample":
            if len(self.sampleCodes) != 1 or self.groups:
                raise ValueError("sample scope requires exactly one sampleCode and no groups")
        return self


class AbundanceProjectionRequest(BaseModel):
    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    topN: int = Field(default=20, ge=1, le=500)
    ranking: Literal["mean_abundance"] = "mean_abundance"


class FeatureSelection(BaseModel):
    """A chart-independent feature selection that survives scope changes."""

    mode: Literal["ranked", "explicit"] = "ranked"
    ranking: Literal["mean_abundance"] = "mean_abundance"
    limit: int = Field(default=30, ge=1, le=500)
    featureIds: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_features(self):
        self.featureIds = list(
            dict.fromkeys(str(feature_id).strip() for feature_id in self.featureIds if str(feature_id).strip())
        )
        if self.mode == "explicit" and not self.featureIds:
            raise ValueError("explicit feature selection requires at least one featureId")
        if self.mode == "ranked":
            self.featureIds = []
        return self


ProjectionKind = Literal[
    "composition",
    "ko_contribution",
    "boxplot",
    "heatmap",
    "detection",
    "differential_ko",
    "taxonomy",
    "taxonomy_sankey",
    "pca",
    "pcoa",
]


class ChartProjectionRequest(BaseModel):
    """Scope and display parameters for a server-computed chart projection."""

    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    topN: int = Field(default=20, ge=1, le=500)
    parameters: dict[str, Any] = Field(default_factory=dict)
    selection: FeatureSelection | None = None


AuditProjectionKind = Literal[
    "abundance",
    "composition",
    "ko_contribution",
    "boxplot",
    "heatmap",
    "detection",
    "differential_ko",
    "taxonomy",
    "taxonomy_sankey",
    "pca",
    "pcoa",
]


class ProjectionAuditRequest(BaseModel):
    """Exact projection identity plus lazy detail-table pagination."""

    projectionKey: str = Field(min_length=16)
    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    topN: int = Field(default=20, ge=1, le=500)
    parameters: dict[str, Any] = Field(default_factory=dict)
    selection: FeatureSelection | None = None
    ranking: Literal["mean_abundance"] = "mean_abundance"
    section: str = ""
    filters: dict[str, str] = Field(default_factory=dict)
    sortBy: str = ""
    sortDirection: Literal["asc", "desc"] = "asc"
    query: str = ""
    limit: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ScopedSampleRequest(BaseModel):
    """Lightweight sample-metadata query bound to one analytical scope."""

    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    query: str = ""
    limit: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ScopedFeatureRequest(BaseModel):
    """Search and rank the complete feature catalog within one sample scope."""

    scope: AnalysisScope = Field(default_factory=AnalysisScope)
    query: str = ""
    featureIds: list[str] = Field(default_factory=list)
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def normalize_query(self):
        self.query = self.query.strip()
        self.featureIds = list(
            dict.fromkeys(str(feature_id).strip() for feature_id in self.featureIds if str(feature_id).strip())
        )
        return self
