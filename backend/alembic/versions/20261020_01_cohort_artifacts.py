"""Source-based cohort artifacts; no dependency on legacy MAG package tables."""
from alembic import op
from app.core.cohort_schema import metadata

revision = '20261020_01'
down_revision = '20260912_01'
branch_labels = None
depends_on = None


def upgrade():
    metadata.create_all(op.get_bind())


def downgrade():
    # Scientific history is retained; rollback requires an explicit restore.
    pass
