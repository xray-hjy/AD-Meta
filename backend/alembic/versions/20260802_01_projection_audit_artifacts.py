"""Versioned projection audit artifacts and query rows.

Revision ID: 20260802_01
Revises: 20260728_01
"""

from alembic import op

from app.core.database import _split_sql_script
from app.core.projection_audit_schema import (
    MYSQL_PROJECTION_AUDIT_SCHEMA,
    SQLITE_PROJECTION_AUDIT_SCHEMA,
)

revision = "20260802_01"
down_revision = "20260728_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = (
        MYSQL_PROJECTION_AUDIT_SCHEMA
        if bind.dialect.name == "mysql"
        else SQLITE_PROJECTION_AUDIT_SCHEMA
    )
    for statement in _split_sql_script(schema):
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    # These tables record provenance-bearing derived results. Destructive
    # downgrade is intentionally disabled; restore from a backup if required.
    pass
