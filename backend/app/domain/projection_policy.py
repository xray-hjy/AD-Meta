"""Scientific and display policies for server-computed chart projections.

The shared contract describes *where* a chart may run and how its parameters are
validated.  Chart-specific compute modules still own the actual transformation
and inference semantics.  Keeping those responsibilities separate prevents a
generic UI control from silently changing the scientific meaning of every chart.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class NumericParameterPolicy:
    default: float
    minimum: float
    maximum: float
    recommended: tuple[float, ...] = ()
    role: str = "analysis_filter"

    def resolve(self, parameters: dict[str, Any], key: str) -> float:
        raw = parameters.get(key, self.default)
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be numeric") from exc
        if not self.minimum <= value <= self.maximum:
            raise ValueError(
                f"{key} must be between {self.minimum:g} and {self.maximum:g}"
            )
        return value


@dataclass(frozen=True)
class ChoiceParameterPolicy:
    default: str
    choices: tuple[str, ...]
    role: str = "analysis_filter"

    def resolve(self, parameters: dict[str, Any], key: str) -> str:
        value = str(parameters.get(key, self.default))
        if value not in self.choices:
            allowed = ", ".join(self.choices)
            raise ValueError(f"{key} must be one of: {allowed}")
        return value


@dataclass(frozen=True)
class ProjectionPolicy:
    scopes: frozenset[str]
    analysis_family: str = "descriptive"
    min_samples: int = 1
    feature_kind: str | None = None
    min_per_group: int = 0
    top_n_default: int = 20
    top_n_minimum: int = 1
    top_n_maximum: int = 500
    top_n_recommended: tuple[int, ...] = ()
    top_n_role: str = "display_cap"
    parameters: dict[str, NumericParameterPolicy | ChoiceParameterPolicy] = field(default_factory=dict)
    inference_min_per_group: int = 0

    def resolve_parameter(self, parameters: dict[str, Any], key: str) -> Any:
        policy = self.parameters.get(key)
        if policy is None:
            raise ValueError(f"Unsupported parameter for this projection: {key}")
        return policy.resolve(parameters, key)

    def resolve_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        """Return every parameter that actually participates in computation."""
        unknown = sorted(set(parameters) - set(self.parameters))
        if unknown:
            raise ValueError(f"Unsupported parameters: {', '.join(unknown)}")
        return {
            key: parameter.resolve(parameters, key)
            for key, parameter in self.parameters.items()
        }

    def as_legacy_rule(self) -> dict[str, Any]:
        rule: dict[str, Any] = {
            "scopes": set(self.scopes),
            "minSamples": self.min_samples,
        }
        if self.feature_kind:
            rule["featureKind"] = self.feature_kind
        if self.min_per_group:
            rule["minPerGroup"] = self.min_per_group
        return rule


ALL_SCOPES = frozenset({"cohort", "group", "subset", "sample"})
MULTI_SAMPLE_SCOPES = frozenset({"cohort", "group", "subset"})
COMPARISON_SCOPES = frozenset({"cohort", "subset"})


PROJECTION_POLICIES: dict[str, ProjectionPolicy] = {
    "composition": ProjectionPolicy(
        scopes=ALL_SCOPES,
        analysis_family="descriptive_composition",
        feature_kind="taxonomy",
        top_n_default=8,
        top_n_maximum=50,
        top_n_recommended=(5, 8, 10, 20, 50),
        top_n_role="aggregation_limit",
    ),
    # A true KEGG category composition needs a versioned KO annotation mapping;
    # see docs/development/ko-functional-category-composition-follow-up.md.
    # Remove this note after that documented extension is implemented.
    "ko_contribution": ProjectionPolicy(
        scopes=ALL_SCOPES,
        analysis_family="descriptive_relative_contribution",
        feature_kind="ko",
        top_n_default=20,
        top_n_maximum=100,
        top_n_recommended=(10, 20, 50, 100),
        top_n_role="display_cap",
    ),
    "taxonomy": ProjectionPolicy(
        scopes=ALL_SCOPES,
        analysis_family="taxonomy_hierarchy",
        feature_kind="taxonomy",
        top_n_role="not_applicable",
    ),
    "taxonomy_sankey": ProjectionPolicy(
        scopes=ALL_SCOPES,
        analysis_family="taxonomy_flow",
        feature_kind="taxonomy",
        top_n_role="not_applicable",
    ),
    "boxplot": ProjectionPolicy(
        scopes=MULTI_SAMPLE_SCOPES,
        analysis_family="distribution",
        min_samples=2,
        feature_kind="taxonomy",
        top_n_default=30,
        top_n_maximum=100,
        top_n_recommended=(5, 10, 20, 30, 50, 100),
        top_n_role="feature_selection",
    ),
    "pca": ProjectionPolicy(
        scopes=MULTI_SAMPLE_SCOPES,
        analysis_family="exploratory_ordination",
        min_samples=3,
        feature_kind="taxonomy",
        top_n_default=50,
        top_n_minimum=2,
        top_n_recommended=(50, 100, 200, 500),
        top_n_role="feature_selection",
    ),
    "pcoa": ProjectionPolicy(
        scopes=MULTI_SAMPLE_SCOPES,
        analysis_family="ordination_with_optional_inference",
        min_samples=3,
        feature_kind="taxonomy",
        top_n_role="not_applicable",
        parameters={
            "filterPreset": ChoiceParameterPolicy(
                default="standard",
                choices=("unfiltered", "inclusive", "standard", "robust"),
                role="ordination_filter",
            ),
        },
        inference_min_per_group=3,
    ),
    "heatmap": ProjectionPolicy(
        scopes=COMPARISON_SCOPES,
        analysis_family="exploratory_group_comparison",
        min_samples=6,
        min_per_group=3,
        feature_kind="taxonomy",
        top_n_default=50,
        top_n_recommended=(20, 50, 100, 200),
        top_n_role="display_cap",
        parameters={
            "qValueMax": NumericParameterPolicy(
                default=0.05,
                minimum=0.0001,
                maximum=1.0,
                recommended=(0.01, 0.05, 0.1),
            ),
            "log2FcMinAbs": NumericParameterPolicy(
                default=1.0,
                minimum=0.0,
                maximum=20.0,
                recommended=(0.5, 1.0, 1.5, 2.0),
            ),
        },
    ),
    "detection": ProjectionPolicy(
        scopes=COMPARISON_SCOPES,
        analysis_family="descriptive_group_comparison",
        min_samples=6,
        min_per_group=3,
        feature_kind="ko",
        top_n_default=50,
        top_n_recommended=(20, 50, 100, 200),
        top_n_role="display_cap",
        parameters={
            "abundanceThreshold": NumericParameterPolicy(
                default=0.0,
                minimum=0.0,
                maximum=1_000_000_000.0,
                # The current artifact does not declare a normalized abundance
                # unit, so only the unit-independent presence rule (> 0) is
                # exposed by the UI. Future manifests may provide unit-aware
                # presets without changing the projection contract.
                recommended=(0.0,),
                role="detection_rule",
            ),
        },
    ),
    "differential_ko": ProjectionPolicy(
        scopes=COMPARISON_SCOPES,
        analysis_family="exploratory_group_comparison",
        min_samples=6,
        min_per_group=3,
        feature_kind="ko",
        top_n_default=30,
        top_n_maximum=100,
        top_n_recommended=(10, 20, 30, 50, 100),
        top_n_role="display_cap",
        parameters={
            "qValueMax": NumericParameterPolicy(
                default=0.05,
                minimum=0.0001,
                maximum=1.0,
                recommended=(0.01, 0.05, 0.1),
            ),
            "prevalenceMin": NumericParameterPolicy(
                default=0.1,
                minimum=0.0,
                maximum=1.0,
                recommended=(0.0, 0.05, 0.1, 0.2, 0.3),
            ),
        },
    ),
}


__all__ = [
    "ChoiceParameterPolicy",
    "NumericParameterPolicy",
    "ProjectionPolicy",
    "PROJECTION_POLICIES",
]
