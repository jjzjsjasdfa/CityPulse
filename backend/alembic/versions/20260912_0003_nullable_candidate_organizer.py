"""Allow review candidates whose source does not name an organizer."""

from alembic import op

revision = "20260912_0003"
down_revision = "20260911_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE event_candidates ALTER COLUMN organizer DROP NOT NULL")


def downgrade() -> None:
    op.execute(
        "UPDATE event_candidates SET organizer = '' WHERE organizer IS NULL; "
        "ALTER TABLE event_candidates ALTER COLUMN organizer SET NOT NULL"
    )
