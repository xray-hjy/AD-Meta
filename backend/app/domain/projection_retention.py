"""Retention policy for persisted derived projection read models."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.domain.analysis_scope import ProjectionAuditRequest
from app.domain.projection_policy import PROJECTION_POLICIES


@dataclass(frozen=True)
class ProjectionRetention:
    retention_class: str
    expires_at: str | None


def _is_default_request(kind: str, request: ProjectionAuditRequest) -> bool:
    if request.scope.mode not in {"cohort", "group"}:
        return False
    if request.selection is not None:
        return False

    policy = PROJECTION_POLICIES.get(kind)
    if policy is None:
        return kind == "abundance" and request.topN == 20 and not request.parameters

    try:
        resolved_parameters = policy.resolve_parameters(request.parameters)
    except ValueError:
        return False
    default_parameters = policy.resolve_parameters({})
    if resolved_parameters != default_parameters:
        return False
    if policy.top_n_role == "not_applicable":
        return True
    return request.topN == policy.top_n_default


def resolve_projection_retention(
    kind: str,
    request: ProjectionAuditRequest,
    *,
    ttl_hours: int,
    now: datetime | None = None,
) -> ProjectionRetention:
    """Keep canonical cohort projections; expire user-specific derivatives."""

    if _is_default_request(kind, request):
        return ProjectionRetention("default", None)
    current = now or datetime.now(timezone.utc)
    expires_at = (current + timedelta(hours=max(1, ttl_hours))).replace(
        microsecond=0
    )
    return ProjectionRetention("temporary", expires_at.isoformat())


__all__ = ["ProjectionRetention", "resolve_projection_retention"]
