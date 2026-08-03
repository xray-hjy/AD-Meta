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
