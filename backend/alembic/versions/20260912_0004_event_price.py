"""Add source-friendly display prices to events and review candidates."""

from alembic import op

revision = "20260912_0004"
down_revision = "20260912_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN price VARCHAR(80)")
    op.execute("ALTER TABLE event_candidates ADD COLUMN price VARCHAR(80)")


def downgrade() -> None:
    op.execute("ALTER TABLE event_candidates DROP COLUMN price")
    op.execute("ALTER TABLE events DROP COLUMN price")
