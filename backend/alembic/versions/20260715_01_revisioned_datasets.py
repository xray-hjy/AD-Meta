"""Baseline schema and immutable dataset revisions.

Revision ID: 20260715_01
Revises: None
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

from app.core.database import MYSQL_SCHEMA, SQLITE_SCHEMA, _split_sql_script

revision = "20260715_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    schema = MYSQL_SCHEMA if bind.dialect.name == "mysql" else SQLITE_SCHEMA
    for statement in _split_sql_script(schema):
        bind.exec_driver_sql(statement)

    dataset_columns = {column["name"] for column in inspect(bind).get_columns("datasets")}
    if "current_revision_id" not in dataset_columns:
        op.add_column("datasets", sa.Column("current_revision_id", sa.BigInteger(), nullable=True))
    if "analysis_status" not in dataset_columns:
        op.add_column(
            "datasets",
            sa.Column("analysis_status", sa.String(length=32), nullable=False, server_default="exploratory_only"),
        )
    if "provenance_json" not in dataset_columns:
        json_type = sa.JSON() if bind.dialect.name == "mysql" else sa.Text()
        op.add_column("datasets", sa.Column("provenance_json", json_type, nullable=True))


def downgrade() -> None:
    # Dataset revisions are scientific provenance.  Automated destructive
    # downgrade is intentionally disabled; restore from a database backup.
    pass
