"""Public functional projection contracts; namespaces retain their own scientific units."""
from typing import Any

from pydantic import BaseModel, Field


class FunctionalIdentity(BaseModel):
    release: str
    annotationRevision: str | None = None
    projectionFingerprint: str
    analysisVersion: str


class FunctionalIds(BaseModel):
    """Long explicit selections travel in a JSON body; identity stays in the URL."""
    model_config = {'extra': 'forbid', 'populate_by_name': True}
    mag_ids: str | None = Field(None, alias='magIds', max_length=150000)
    feature_ids: str | None = Field(None, alias='featureIds', max_length=20000)


class FunctionalOverview(FunctionalIdentity):
    scopeKind: str
    items: list[dict[str, Any]]
    report: dict[str, Any]
    namespaces: list[dict[str, str]]
    themes: list[dict[str, Any]]


class FunctionalPage(FunctionalIdentity):
    scopeKind: str
    items: list[dict[str, Any]]
    total: int
    limit: int = 25
    offset: int = 0
    namespace: str | None = None
    featureId: str | None = None
    sampleScope: dict[str, Any] | None = None
    testFamily: int | None = None


class FunctionalMatrix(FunctionalIdentity):
    scopeKind: str
    namespace: str
    valueKind: str
    unit: str | None = None
    mags: list[dict[str, Any]]
    features: list[dict[str, Any]]
    values: list[list[int | None]]
    selection: dict[str, int]
    methods: dict[str, Any]
    theme: dict[str, Any] | None = None
    dendrograms: dict[str, Any] = Field(default_factory=dict)


class FunctionalGenePage(FunctionalPage):
    contigs: list[dict[str, Any]]
    coordinateConvention: str
    filteredEvidence: bool
    hasSequence: bool


class FunctionalSignals(FunctionalPage):
    samples: list[dict[str, Any]]
    unit: str
    kind: str
    meaning: str


class FunctionalEvidence(FunctionalIdentity):
    scopeKind: str = 'catalog'
    items: list[dict[str, Any]]
    magId: str | None = None
    sampleScope: dict[str, Any] | None = None


class FunctionalCommunity(FunctionalIdentity):
    featureId: str | None = None
    available: bool
    items: list[dict[str, Any]]
    communityRevision: str | None = None
    link: dict[str, Any] = Field(default_factory=dict)
    unit: str | None = None
    meaning: str | None = None
