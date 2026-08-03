from __future__ import annotations

from unittest.mock import patch

from app.cli.warm_projection_cache import warm_default_projection_cache


def test_warm_default_projection_cache_builds_every_registered_audit_section() -> None:
    runs = [
        {
            "key": "run-1",
            "status": "published",
            "artifacts": [
                {
                    "key": "species",
                    "featureKind": "taxonomy",
                }
            ],
        }
    ]
    audit_sections: list[tuple[str, str]] = []

    def record_audit(_run, _artifact, kind, request):
        audit_sections.append((kind, request.section))
        return {"projectionKey": request.projectionKey}

    with (
        patch("app.cli.warm_projection_cache.list_analysis_runs", return_value=runs),
        patch(
            "app.cli.warm_projection_cache.PROJECTIONS_BY_FEATURE_KIND",
            {"taxonomy": ("taxonomy_sankey",)},
        ),
        patch(
            "app.cli.warm_projection_cache.project_abundance",
            return_value={"projectionKey": "a" * 64},
        ),
        patch(
            "app.cli.warm_projection_cache.project_chart",
            return_value={"projectionKey": "b" * 64},
        ),
        patch(
            "app.cli.warm_projection_cache.get_projection_audit_metadata",
            side_effect=record_audit,
        ),
    ):
        results = warm_default_projection_cache()

    assert audit_sections == [
        ("abundance", "selection"),
        ("taxonomy_sankey", "hierarchy_aggregation"),
        ("taxonomy_sankey", "sankey_layout"),
    ]
    assert [item["projection"] for item in results] == [
        "abundance",
        "abundance-audit:selection",
        "taxonomy_sankey",
        "taxonomy_sankey-audit:hierarchy_aggregation",
        "taxonomy_sankey-audit:sankey_layout",
    ]


def test_warm_default_projection_cache_can_target_ordination_only() -> None:
    runs = [
        {
            "key": "run-1",
            "status": "published",
            "artifacts": [{"key": "species", "featureKind": "taxonomy"}],
        }
    ]

    with (
        patch("app.cli.warm_projection_cache.list_analysis_runs", return_value=runs),
        patch(
            "app.cli.warm_projection_cache.warm_revision_matrix_cache",
            return_value={"sampleCount": 373, "featureCount": 9460},
        ) as warm_matrix,
        patch(
            "app.cli.warm_projection_cache.project_chart",
            return_value={"projectionKey": "b" * 64},
        ) as project_chart,
        patch("app.cli.warm_projection_cache.project_abundance") as project_abundance,
        patch(
            "app.cli.warm_projection_cache.get_projection_audit_metadata"
        ) as get_audit,
    ):
        results = warm_default_projection_cache(
            projection_kinds={"pca", "pcoa"},
            include_abundance=False,
            include_audits=False,
        )

    warm_matrix.assert_called_once_with("run-1", "species")
    assert [call.args[2] for call in project_chart.call_args_list] == ["pca", "pcoa"]
    project_abundance.assert_not_called()
    get_audit.assert_not_called()
    assert [item["projection"] for item in results] == [
        "analysis-matrix:373x9460",
        "pca",
        "pcoa",
    ]
