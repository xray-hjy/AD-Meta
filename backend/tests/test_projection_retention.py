from __future__ import annotations

from datetime import datetime, timezone

from app.domain.analysis_scope import AnalysisScope, ProjectionAuditRequest
from app.domain.projection_retention import resolve_projection_retention


def test_retention_policy_keeps_canonical_defaults_and_expires_custom_results() -> None:
    now = datetime(2026, 8, 20, tzinfo=timezone.utc)
    canonical = resolve_projection_retention(
        "composition",
        ProjectionAuditRequest(projectionKey="a" * 16, topN=8),
        ttl_hours=24,
        now=now,
    )
    canonical_group = resolve_projection_retention(
        "composition",
        ProjectionAuditRequest(
            projectionKey="b" * 16,
            topN=8,
            scope=AnalysisScope(mode="group", groups=["AD"]),
        ),
        ttl_hours=24,
        now=now,
    )
    custom = resolve_projection_retention(
        "composition",
        ProjectionAuditRequest(
            projectionKey="c" * 16,
            topN=8,
            scope=AnalysisScope(
                mode="subset",
                sampleCodes=["sample-1", "sample-2"],
            ),
        ),
        ttl_hours=24,
        now=now,
    )

    assert canonical.retention_class == "default"
    assert canonical.expires_at is None
    assert canonical_group.retention_class == "default"
    assert canonical_group.expires_at is None
    assert custom.retention_class == "temporary"
    assert custom.expires_at == "2026-08-21T00:00:00+00:00"
