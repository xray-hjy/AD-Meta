"""Analysis runs, artifacts, and exact sample coverage.

Revision ID: 20260728_01
Revises: 20260715_01
"""

from alembic import op

from app.core.analysis_schema import MYSQL_ANALYSIS_SCHEMA, SQLITE_ANALYSIS_SCHEMA
from app.core.database import _split_sql_script

revision = "20260728_01"
down_revision = "20260715_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = MYSQL_ANALYSIS_SCHEMA if bind.dialect.name == "mysql" else SQLITE_ANALYSIS_SCHEMA
    for statement in _split_sql_script(schema):
        bind.exec_driver_sql(statement)


def downgrade() -> None:
    # Analysis identity is provenance-bearing data. Destructive downgrade is
    # intentionally disabled; restore from a database backup when required.
    pass
