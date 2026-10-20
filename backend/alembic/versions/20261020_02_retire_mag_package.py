"""Remove obsolete versioned MAG package tables after cohort import."""

from alembic import op
from sqlalchemy import inspect

revision = "20261020_02"
down_revision = "20261020_01"
branch_labels = None
depends_on = None

LEGACY_TABLES = (
    "mag_species_crosswalk",
    "mag_cluster_members",
    "mag_abundances",
    "mag_taxonomy",
    "mag_quality",
    "mag_package_files",
    "mag_clusters",
    "mag_representatives",
    "mag_samples",
    "mag_dataset_versions",
)


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    for table in LEGACY_TABLES:
        if table in existing:
            op.drop_table(table)


def downgrade() -> None:
    # Retired package data cannot be reconstructed from the new cohort model.
    pass
