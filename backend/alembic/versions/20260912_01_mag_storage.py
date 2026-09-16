"""Versioned relational storage for validated MAG datasets.

Revision ID: 20260912_01
Revises: 20260820_01
"""

from alembic import op

from app.core.database import _split_sql_script
from app.core.mag_schema import MYSQL_MAG_SCHEMA, SQLITE_MAG_SCHEMA

revision = "20260912_01"
down_revision = "20260820_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = MYSQL_MAG_SCHEMA if bind.dialect.name == "mysql" else SQLITE_MAG_SCHEMA
    for statement in _split_sql_script(schema):
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    # MAG versions carry scientific provenance. Restore a database backup
    # instead of automatically dropping or rewriting validated observations.
    pass
