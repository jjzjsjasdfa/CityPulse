"""Store normalized coordinates on review candidates."""

from alembic import op

revision = "20260913_0006"
down_revision = "20260912_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE event_candidates ADD COLUMN latitude DOUBLE PRECISION")
    op.execute("ALTER TABLE event_candidates ADD COLUMN longitude DOUBLE PRECISION")


def downgrade() -> None:
    op.execute("ALTER TABLE event_candidates DROP COLUMN longitude")
    op.execute("ALTER TABLE event_candidates DROP COLUMN latitude")
