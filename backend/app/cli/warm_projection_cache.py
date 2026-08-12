from __future__ import annotations

import argparse

from app.domain.analysis_scope import (
    AbundanceProjectionRequest,
    AnalysisScope,
    ChartProjectionRequest,
    ProjectionAuditRequest,
)
from app.domain.projection_policy import PROJECTION_POLICIES
from app.services.analysis_projection_service import project_abundance
from app.services.analysis_run_service import list_analysis_runs
from app.services.chart_projection_service import project_chart, warm_revision_matrix_cache
from app.services.projection_audit_service import (
    get_projection_audit_metadata,
    projection_audit_sections,
)

PROJECTIONS_BY_FEATURE_KIND = {
    "taxonomy": (
        "composition",
        "boxplot",
        "heatmap",
        "taxonomy",
        "taxonomy_sankey",
        "pca",
        "pcoa",
    ),
    "ko": ("ko_contribution", "detection", "differential_ko"),
}


def warm_default_projection_cache(
    *,
    projection_kinds: set[str] | None = None,
    include_abundance: bool = True,
    include_audits: bool = True,
) -> list[dict[str, str]]:
    """Compute the registered cohort defaults for every published artifact."""
    results: list[dict[str, str]] = []
    scope = AnalysisScope()
    for run in list_analysis_runs():
        if run.get("status") != "published":
            continue
        for artifact in run.get("artifacts") or []:
            run_key = str(run["key"])
            artifact_key = str(artifact["key"])
            artifact_projection_kinds = set(
                PROJECTIONS_BY_FEATURE_KIND.get(str(artifact.get("featureKind")), ())
            )
            requested_projection_kinds = (
                artifact_projection_kinds
                if projection_kinds is None
                else artifact_projection_kinds & projection_kinds
            )
            if requested_projection_kinds & {"boxplot", "pca", "pcoa"}:
                matrix = warm_revision_matrix_cache(run_key, artifact_key)
                results.append(
                    {
                        "run": run_key,
                        "artifact": artifact_key,
                        "projection": (
                            f"analysis-matrix:{matrix['sampleCount']}x{matrix['featureCount']}"
                        ),
                    }
                )
            if include_abundance:
                abundance = project_abundance(
                    run_key,
                    artifact_key,
                    AbundanceProjectionRequest(scope=scope, topN=20),
                )
                results.append(
                    {"run": run_key, "artifact": artifact_key, "projection": "abundance"}
                )
                if include_audits:
                    for section in projection_audit_sections("abundance"):
                        get_projection_audit_metadata(
                            run_key,
                            artifact_key,
                            "abundance",
                            ProjectionAuditRequest(
                                projectionKey=abundance["projectionKey"],
                                scope=scope,
                                topN=20,
                                section=section,
                            ),
                        )
                        results.append(
                            {
                                "run": run_key,
                                "artifact": artifact_key,
                                "projection": f"abundance-audit:{section}",
                            }
                        )
            for projection_kind in PROJECTIONS_BY_FEATURE_KIND.get(
                str(artifact.get("featureKind")), ()
            ):
                if projection_kinds is not None and projection_kind not in projection_kinds:
                    continue
                policy = PROJECTION_POLICIES[projection_kind]
                parameters = {
                    key: parameter.default
                    for key, parameter in policy.parameters.items()
                }
                projection = project_chart(
                    run_key,
                    artifact_key,
                    projection_kind,
                    ChartProjectionRequest(
                        scope=scope,
                        topN=policy.top_n_default,
                        parameters=parameters,
                    ),
                )
                results.append(
                    {
                        "run": run_key,
                        "artifact": artifact_key,
                        "projection": projection_kind,
                    }
                )
                if include_audits:
                    for section in projection_audit_sections(projection_kind):
                        get_projection_audit_metadata(
                            run_key,
                            artifact_key,
                            projection_kind,
                            ProjectionAuditRequest(
                                projectionKey=projection["projectionKey"],
                                scope=scope,
                                topN=policy.top_n_default,
                                parameters=parameters,
                                section=section,
                            ),
                        )
                        results.append(
                            {
                                "run": run_key,
                                "artifact": artifact_key,
                                "projection": f"{projection_kind}-audit:{section}",
                            }
                        )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Warm AD-Meta default projection caches.")
    parser.add_argument("--projection", action="append", dest="projections")
    parser.add_argument("--skip-abundance", action="store_true")
    parser.add_argument("--skip-audits", action="store_true")
    args = parser.parse_args()
    results = warm_default_projection_cache(
        projection_kinds=set(args.projections) if args.projections else None,
        include_abundance=not args.skip_abundance,
        include_audits=not args.skip_audits,
    )
    print(f"Warmed {len(results)} default projection(s).")
    for result in results:
        print(
            f"- {result['run']} / {result['artifact']} / {result['projection']}"
        )


if __name__ == "__main__":
    main()
