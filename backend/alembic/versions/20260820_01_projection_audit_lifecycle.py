"""Add lifecycle metadata to derived projection audit artifacts.

Revision ID: 20260820_01
Revises: 20260802_01
"""

from alembic import op

revision = "20260820_01"
down_revision = "20260802_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    datetime_type = "DATETIME(6)" if bind.dialect.name == "mysql" else "TEXT"
    op.execute(
        "ALTER TABLE projection_audit_artifacts "
        "ADD COLUMN retention_class VARCHAR(32) NOT NULL DEFAULT 'temporary'"
    )
    op.execute(
        f"ALTER TABLE projection_audit_artifacts ADD COLUMN last_accessed_at {datetime_type} NULL"
    )
    op.execute(
        f"ALTER TABLE projection_audit_artifacts ADD COLUMN expires_at {datetime_type} NULL"
    )
    op.execute(
        "UPDATE projection_audit_artifacts "
        "SET last_accessed_at = updated_at WHERE last_accessed_at IS NULL"
    )
    op.create_index(
        "idx_projection_audit_artifacts_expiry",
        "projection_audit_artifacts",
        ["retention_class", "expires_at"],
    )


def downgrade() -> None:
    # Derived read models can be rebuilt. Keep the non-destructive migration
    # convention used by the preceding projection-audit revision.
    pass
