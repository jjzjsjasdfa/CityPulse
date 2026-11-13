"""Remove synthetic demo events and their marker column."""

import sqlalchemy as sa

from alembic import op

revision = "20260922_0009"
down_revision = "20260916_0008_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM events WHERE is_demo IS TRUE")
    op.drop_column("events", "is_demo")


def downgrade() -> None:
    op.add_column(
        "events",
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.alter_column("events", "is_demo", server_default=None)
